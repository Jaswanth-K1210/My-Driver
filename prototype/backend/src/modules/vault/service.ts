import { pool } from '../../db/client.js'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { counter } from '../../lib/metrics.js'
import { getStorageProvider } from '../../providers/storage/index.js'
import { renderCertificate } from './certificate.js'
import { watermark } from './watermark.js'
import { INSPECTION_ZONES, isComplete, missingZones, type InspectionPhase, type InspectionZone } from './zones.js'

const MAX_PHOTO_BYTES = 8 * 1024 * 1024

/** Human-facing trip reference, matching the short id the clients display. */
export const tripRef = (tripId: string): string =>
  `TRP-${tripId.replace(/-/g, '').slice(0, 6).toUpperCase()}`

export const certRef = (tripId: string, issuedAt: Date): string =>
  `MV-${issuedAt.getFullYear()}-${tripId.replace(/-/g, '').slice(0, 6).toUpperCase()}`

function decodePhoto(base64: string): Buffer {
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const buf = Buffer.from(payload, 'base64')
  if (buf.length === 0) throw badRequest('INVALID_PHOTO', 'The photo could not be decoded')
  if (buf.length > MAX_PHOTO_BYTES) {
    throw badRequest('PHOTO_TOO_LARGE', 'Each inspection photo must be under 8 MB')
  }
  return buf
}

async function assertDriverOnTrip(tripId: string, driverId: string) {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM trips WHERE id = $1 AND driver_id = $2`,
    [tripId, driverId],
  )
  if (!rows[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip for this driver')
  return rows[0]
}

export async function startInspection(
  tripId: string,
  driverId: string,
  phase: InspectionPhase,
): Promise<{ inspection_id: string; phase: InspectionPhase; remaining: InspectionZone[] }> {
  const trip = await assertDriverOnTrip(tripId, driverId)

  // A pre-trip inspection documents the car before it moves; a post-trip one
  // documents it after. Recording them in the wrong state proves nothing.
  if (phase === 'PRE' && !['HANDSHAKE_PENDING', 'IN_TRIP'].includes(trip.status)) {
    throw conflict('INVALID_TRIP_STATE', `A pre-trip inspection cannot start in ${trip.status}`)
  }
  if (phase === 'POST' && !['IN_TRIP', 'ESCALATED', 'COMPLETED'].includes(trip.status)) {
    throw conflict('INVALID_TRIP_STATE', `A post-trip inspection cannot start in ${trip.status}`)
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO inspections (trip_id, phase, driver_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (trip_id, phase) DO UPDATE SET trip_id = EXCLUDED.trip_id
     RETURNING id`,
    [tripId, phase, driverId],
  )
  const inspectionId = rows[0]!.id

  return { inspection_id: inspectionId, phase, remaining: await remainingZones(inspectionId) }
}

async function remainingZones(inspectionId: string): Promise<InspectionZone[]> {
  const { rows } = await pool.query<{ zone: string }>(
    `SELECT zone FROM inspection_photos WHERE inspection_id = $1`,
    [inspectionId],
  )
  return missingZones(rows.map((r) => r.zone))
}

export async function capturePhoto(input: {
  tripId: string
  driverId: string
  phase: InspectionPhase
  zone: InspectionZone
  photoBase64: string
  lat?: number
  lng?: number
}): Promise<{ zone: InspectionZone; sha256: string; remaining: InspectionZone[]; complete: boolean }> {
  await assertDriverOnTrip(input.tripId, input.driverId)

  const { rows } = await pool.query<{ id: string; completed_at: Date | null }>(
    `SELECT id, completed_at FROM inspections WHERE trip_id = $1 AND phase = $2`,
    [input.tripId, input.phase],
  )
  const inspection = rows[0]
  if (!inspection) throw notFound('INSPECTION_NOT_STARTED', 'Start the inspection first')
  if (inspection.completed_at) {
    // Sealed means sealed: a completed inspection cannot gain new photos.
    throw conflict('INSPECTION_SEALED', 'That inspection is already sealed')
  }

  const capturedAt = new Date()
  const marked = await watermark(decodePhoto(input.photoBase64), {
    tripRef: tripRef(input.tripId),
    zone: input.zone,
    phase: input.phase,
    capturedAt,
    lat: input.lat,
    lng: input.lng,
  })

  const key = `vault/${input.tripId}/${input.phase.toLowerCase()}/${input.zone.toLowerCase()}.jpg`
  await getStorageProvider().put(key, marked.bytes, 'image/jpeg')

  try {
    await pool.query(
      `INSERT INTO inspection_photos
         (inspection_id, zone, storage_key, sha256, bytes, lat, lng, captured_at, watermark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        inspection.id,
        input.zone,
        key,
        marked.sha256,
        marked.bytes.length,
        input.lat ?? null,
        input.lng ?? null,
        capturedAt,
        JSON.stringify(marked.watermark),
      ],
    )
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw conflict('ZONE_ALREADY_CAPTURED', `${input.zone} has already been photographed`)
    }
    throw err
  }

  counter('mydriver_inspection_photos_total')
  const remaining = await remainingZones(inspection.id)
  return { zone: input.zone, sha256: marked.sha256, remaining, complete: remaining.length === 0 }
}

export async function completeInspection(
  tripId: string,
  driverId: string,
  phase: InspectionPhase,
): Promise<{ inspection_id: string; photos: number; sealed_at: string }> {
  await assertDriverOnTrip(tripId, driverId)

  const { rows } = await pool.query<{ id: string; completed_at: Date | null }>(
    `SELECT id, completed_at FROM inspections WHERE trip_id = $1 AND phase = $2`,
    [tripId, phase],
  )
  const inspection = rows[0]
  if (!inspection) throw notFound('INSPECTION_NOT_STARTED', 'Start the inspection first')

  const { rows: captured } = await pool.query<{ zone: string }>(
    `SELECT zone FROM inspection_photos WHERE inspection_id = $1`,
    [inspection.id],
  )
  if (!isComplete(captured.map((c) => c.zone))) {
    // All eight or none: a partial inspection is not evidence of anything.
    throw badRequest('INSPECTION_INCOMPLETE', 'All 8 zones must be photographed', {
      missing: missingZones(captured.map((c) => c.zone)),
    })
  }

  const { rows: sealed } = await pool.query<{ completed_at: Date }>(
    `UPDATE inspections SET completed_at = COALESCE(completed_at, now())
      WHERE id = $1 RETURNING completed_at`,
    [inspection.id],
  )

  return {
    inspection_id: inspection.id,
    photos: captured.length,
    sealed_at: sealed[0]!.completed_at.toISOString(),
  }
}

export async function inspectionStatus(tripId: string, userId: string) {
  const { rows: trip } = await pool.query(
    `SELECT id FROM trips WHERE id = $1 AND (customer_id = $2 OR driver_id = $2)`,
    [tripId, userId],
  )
  if (!trip[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip')

  const { rows } = await pool.query<{
    phase: InspectionPhase
    completed_at: Date | null
    zone: string | null
    sha256: string | null
    captured_at: Date | null
  }>(
    `SELECT i.phase, i.completed_at, p.zone, p.sha256, p.captured_at
       FROM inspections i
       LEFT JOIN inspection_photos p ON p.inspection_id = i.id
      WHERE i.trip_id = $1
      ORDER BY i.phase, p.captured_at`,
    [tripId],
  )

  type PhotoSummary = { zone: InspectionZone; sha256: string | null; captured_at: string | null }
  const byPhase = new Map<InspectionPhase, { sealed_at: string | null; photos: PhotoSummary[] }>()
  for (const row of rows) {
    if (!byPhase.has(row.phase)) {
      byPhase.set(row.phase, {
        sealed_at: row.completed_at ? row.completed_at.toISOString() : null,
        photos: [],
      })
    }
    if (row.zone) {
      byPhase.get(row.phase)!.photos.push({
        zone: row.zone as InspectionZone,
        sha256: row.sha256,
        captured_at: row.captured_at?.toISOString() ?? null,
      })
    }
  }

  return {
    // Spread the readonly tuple: the response schema expects a mutable array.
    zones: [...INSPECTION_ZONES],
    phases: [...byPhase.entries()].map(([phase, v]) => ({ phase, ...v })),
  }
}

/* ── Certificate ───────────────────────────────────────────────────────── */

export async function issueCertificate(
  tripId: string,
  requesterId: string,
): Promise<{ cert_id: string; url: string; sha256: string; issued_at: string }> {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT t.id, t.status, t.required_certification, t.speed_ceiling_kmh,
            t.pickup_address, t.drop_address, t.requested_at, t.completed_at,
            t.distance_km::float8 AS distance_km, t.duration_min,
            t.fare_amount::float8 AS fare_amount,
            cu.full_name AS customer_name,
            du.full_name AS driver_name,
            dp.vehicle_model, dp.vehicle_plate
       FROM trips t
       JOIN users cu ON cu.id = t.customer_id
       LEFT JOIN users du ON du.id = t.driver_id
       LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id
      WHERE t.id = $1 AND (t.customer_id = $2 OR t.driver_id = $2)`,
    [tripId, requesterId],
  )
  const trip = rows[0]
  if (!trip) throw notFound('TRIP_NOT_FOUND', 'No such trip')
  if (trip.status !== 'COMPLETED') {
    throw conflict('TRIP_NOT_COMPLETED', 'A certificate is issued once the trip completes')
  }

  // Certificates are immutable. Re-requesting returns the one already issued
  // rather than minting a second document for the same trip.
  const existing = await pool.query<{ cert_id: string; storage_key: string; sha256: string; issued_at: Date }>(
    `SELECT cert_id, storage_key, sha256, issued_at FROM trip_certificates WHERE trip_id = $1`,
    [tripId],
  )
  if (existing.rows[0]) {
    const c = existing.rows[0]
    return {
      cert_id: c.cert_id,
      url: await getStorageProvider().signedUrl(c.storage_key, 600),
      sha256: c.sha256,
      issued_at: c.issued_at.toISOString(),
    }
  }

  const [{ rows: telemetry }, { rows: ledger }, { rows: anomalies }, { rows: photos }] =
    await Promise.all([
      pool.query<{ n: string }>(`SELECT count(*) AS n FROM telematics_logs WHERE trip_id = $1`, [tripId]),
      pool.query<{ n: string }>(`SELECT count(*) AS n FROM trip_events WHERE trip_id = $1`, [tripId]),
      pool.query<{ reason: string; level: string; created_at: Date }>(
        `SELECT reason, level, created_at FROM anomalies WHERE trip_id = $1 ORDER BY created_at`,
        [tripId],
      ),
      pool.query<{ zone: InspectionZone; phase: string; sha256: string; captured_at: Date }>(
        `SELECT p.zone, i.phase, p.sha256, p.captured_at
           FROM inspection_photos p JOIN inspections i ON i.id = p.inspection_id
          WHERE i.trip_id = $1 ORDER BY i.phase, p.captured_at`,
        [tripId],
      ),
    ])

  const issuedAt = new Date()
  const certId = certRef(tripId, issuedAt)

  const { bytes, sha256: digest } = await renderCertificate({
    certId,
    tripRef: tripRef(tripId),
    tripId,
    issuedAt,
    customerName: trip.customer_name as string | null,
    driverName: trip.driver_name as string | null,
    vehicle: trip.vehicle_model as string | null,
    plate: trip.vehicle_plate as string | null,
    skill: trip.required_certification as string,
    from: trip.pickup_address as string | null,
    to: trip.drop_address as string | null,
    requestedAt: trip.requested_at as Date,
    completedAt: trip.completed_at as Date | null,
    distanceKm: trip.distance_km as number | null,
    durationMin: trip.duration_min as number | null,
    speedCeilingKmh: trip.speed_ceiling_kmh as number,
    fareAmount: trip.fare_amount as number | null,
    telemetryPoints: Number(telemetry[0]!.n),
    ledgerEntries: Number(ledger[0]!.n),
    anomalies: anomalies.map((a) => ({
      reason: a.reason,
      level: a.level,
      at: a.created_at.toISOString(),
    })),
    photos: photos.map((p) => ({
      zone: p.zone,
      phase: p.phase,
      sha256: p.sha256,
      capturedAt: p.captured_at.toISOString(),
    })),
  })

  const key = `vault/${tripId}/certificate-${certId}.pdf`
  await getStorageProvider().put(key, bytes, 'application/pdf')

  await pool.query(
    `INSERT INTO trip_certificates (trip_id, cert_id, storage_key, sha256, payload, issued_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (trip_id) DO NOTHING`,
    [
      tripId,
      certId,
      key,
      digest,
      JSON.stringify({
        telemetry_points: Number(telemetry[0]!.n),
        ledger_entries: Number(ledger[0]!.n),
        photos: photos.length,
        anomalies: anomalies.length,
      }),
      issuedAt,
    ],
  )

  counter('mydriver_certificates_issued_total')
  return {
    cert_id: certId,
    url: await getStorageProvider().signedUrl(key, 600),
    sha256: digest,
    issued_at: issuedAt.toISOString(),
  }
}

/** Signed, short-lived URLs for a participant to view the sealed photos. */
export async function vaultPhotos(tripId: string, userId: string) {
  const { rows: trip } = await pool.query(
    `SELECT id FROM trips WHERE id = $1 AND (customer_id = $2 OR driver_id = $2)`,
    [tripId, userId],
  )
  if (!trip[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip')

  const { rows } = await pool.query<{
    zone: InspectionZone
    phase: string
    storage_key: string
    sha256: string
    captured_at: Date
  }>(
    `SELECT p.zone, i.phase, p.storage_key, p.sha256, p.captured_at
       FROM inspection_photos p JOIN inspections i ON i.id = p.inspection_id
      WHERE i.trip_id = $1 ORDER BY i.phase, p.captured_at`,
    [tripId],
  )

  const storage = getStorageProvider()
  return Promise.all(
    rows.map(async (r) => ({
      zone: r.zone,
      phase: r.phase,
      sha256: r.sha256,
      captured_at: r.captured_at.toISOString(),
      url: await storage.signedUrl(r.storage_key, 600),
    })),
  )
}

/** Everything the L5 evidence packet needs from the Vault. */
export async function evidenceBundle(tripId: string) {
  const { rows: photos } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM inspection_photos p
       JOIN inspections i ON i.id = p.inspection_id WHERE i.trip_id = $1`,
    [tripId],
  )
  const { rows: cert } = await pool.query<{ cert_id: string; sha256: string }>(
    `SELECT cert_id, sha256 FROM trip_certificates WHERE trip_id = $1`,
    [tripId],
  )
  return {
    inspection_photos: Number(photos[0]!.n),
    certificate: cert[0] ? { cert_id: cert[0].cert_id, sha256: cert[0].sha256 } : null,
  }
}

export { forbidden }
