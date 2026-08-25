import { pool } from '../../db/client.js'
import { AppError, conflict, notFound, unauthorized } from '../../lib/errors.js'
import { pepperedEquals } from '../../lib/hash.js'
import { getLivenessProvider } from '../../providers/liveness/index.js'
import { getStorageProvider } from '../../providers/storage/index.js'
import { broadcastStateChange } from './broadcast.js'
import { HANDSHAKE_MAX_ATTEMPTS, recordEvent, transitionTrip } from './service.js'
import type { TripStatus } from './state-machine.js'

const MAX_SELFIE_BYTES = 4 * 1024 * 1024

function decodeSelfie(base64: string): Buffer {
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const buf = Buffer.from(payload, 'base64')
  if (buf.length === 0) throw new AppError(400, 'INVALID_SELFIE', 'The selfie could not be decoded')
  if (buf.length > MAX_SELFIE_BYTES) {
    throw new AppError(413, 'SELFIE_TOO_LARGE', 'The selfie exceeds 4 MB')
  }
  return buf
}

export async function performHandshake(input: {
  tripId: string
  driverId: string
  selfieBase64: string
  otp: string
}): Promise<{ status: 'HANDSHAKE_PASSED'; trip_state: 'IN_TRIP' }> {
  const { rows } = await pool.query<{
    status: TripStatus
    pickup_handshake_otp_hash: string
    handshake_attempts: number
    face_reference_key: string | null
  }>(
    `SELECT t.status, t.pickup_handshake_otp_hash, t.handshake_attempts,
            d.face_reference_key
       FROM trips t
       LEFT JOIN driver_profiles d ON d.user_id = t.driver_id
      WHERE t.id = $1 AND t.driver_id = $2`,
    [input.tripId, input.driverId],
  )

  const trip = rows[0]
  if (!trip) throw notFound('TRIP_NOT_FOUND', 'No such trip for this driver')
  if (trip.status !== 'HANDSHAKE_PENDING') {
    throw conflict('INVALID_TRIP_STATE', `Handshake is not available in state ${trip.status}`)
  }
  if (trip.handshake_attempts >= HANDSHAKE_MAX_ATTEMPTS) {
    throw new AppError(
      423,
      'HANDSHAKE_LOCKED',
      'Too many incorrect codes; this trip can now only be cancelled',
    )
  }

  const selfie = decodeSelfie(input.selfieBase64)

  // Liveness runs before the OTP check so a failed camera check does not burn
  // one of the customer's five code attempts.
  const liveness = await getLivenessProvider().verify(selfie, trip.face_reference_key)
  if (!liveness.match) {
    throw unauthorized('LIVENESS_FAILED', 'Face verification did not pass', {
      confidence: liveness.confidence,
    })
  }

  if (!pepperedEquals(input.otp, trip.pickup_handshake_otp_hash)) {
    await pool.query(
      `UPDATE trips SET handshake_attempts = handshake_attempts + 1 WHERE id = $1`,
      [input.tripId],
    )
    throw unauthorized('INVALID_HANDSHAKE_OTP', 'That code does not match')
  }

  const key = `handshake/${input.tripId}/${Date.now()}.jpg`
  await getStorageProvider().put(key, selfie, 'image/jpeg')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await transitionTrip(client, input.tripId, 'HANDSHAKE_PENDING', 'IN_TRIP', {
      handshake_at: new Date(),
      started_at: new Date(),
    })
    await recordEvent(client, input.tripId, 'HANDSHAKE_PASSED', input.driverId, 'DRIVER', {
      selfie_key: key,
      liveness_confidence: liveness.confidence,
    })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  await broadcastStateChange(input.tripId, 'IN_TRIP')
  return { status: 'HANDSHAKE_PASSED', trip_state: 'IN_TRIP' }
}
