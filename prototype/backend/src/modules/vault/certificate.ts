import PDFDocument from 'pdfkit'
import { sha256 } from './watermark.js'
import { ZONE_LABEL, type InspectionZone } from './zones.js'

export type CertificateInput = {
  certId: string
  tripRef: string
  tripId: string
  issuedAt: Date
  customerName: string | null
  driverName: string | null
  vehicle: string | null
  plate: string | null
  skill: string
  from: string | null
  to: string | null
  requestedAt: Date
  completedAt: Date | null
  distanceKm: number | null
  durationMin: number | null
  speedCeilingKmh: number
  fareAmount: number | null
  telemetryPoints: number
  ledgerEntries: number
  anomalies: Array<{ reason: string; level: string; at: string }>
  photos: Array<{ zone: InspectionZone; phase: string; sha256: string; capturedAt: string }>
}

const money = (n: number | null): string => (n == null ? '—' : `Rs ${n.toFixed(2)}`)

const istDate = (d: Date | null): string =>
  d ? `${d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })} IST` : '—'

/**
 * Renders the trip certificate as a real PDF.
 *
 * This is the artefact `mobile_app_spec.md` calls "exportable ... for insurance
 * or legal use", so it states what is evidenced and — just as importantly —
 * what is not. Every inspection photo is listed by its SHA-256, which is what
 * lets a third party verify the archive has not been altered since issue.
 *
 * pdfkit's built-in Helvetica has no rupee glyph, so amounts are written "Rs".
 */
export function renderCertificate(input: CertificateInput): Promise<{
  bytes: Buffer
  sha256: string
}> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []

    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => {
      const bytes = Buffer.concat(chunks)
      resolve({ bytes, sha256: sha256(bytes) })
    })

    const RED = '#E01E26'
    const INK = '#1A1A1A'
    const MUTED = '#6B6B6B'

    const rule = () => {
      doc.moveDown(0.4)
      doc.strokeColor('#E5E5E5').lineWidth(1)
        .moveTo(doc.x, doc.y).lineTo(doc.page.width - 48, doc.y).stroke()
      doc.moveDown(0.6)
    }

    const heading = (text: string) => {
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9)
        .text(text.toUpperCase(), { characterSpacing: 1 })
      doc.moveDown(0.35)
    }

    const row = (label: string, value: string) => {
      const y = doc.y
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(label, 48, y, { width: 160 })
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
        .text(value, 212, y, { width: doc.page.width - 260 })
      doc.moveDown(0.25)
    }

    /* Header */
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(22).text('MyDriver')
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text('Trip Certificate')
    doc.fillColor(MUTED).font('Helvetica').fontSize(10)
      .text(`${input.certId}  ·  issued ${istDate(input.issuedAt)}`)
    rule()

    heading('Trip')
    row('Reference', input.tripRef)
    row('Route', `${input.from ?? '—'}  ->  ${input.to ?? '—'}`)
    row('Certification', input.skill)
    row('Requested', istDate(input.requestedAt))
    row('Completed', istDate(input.completedAt))
    doc.moveDown(0.4)

    heading('Parties')
    row('Customer', input.customerName ?? '—')
    row('Driver', input.driverName ?? '—')
    row('Vehicle', [input.vehicle, input.plate].filter(Boolean).join('  ·  ') || '—')
    doc.moveDown(0.4)

    heading('Journey')
    row('Distance', input.distanceKm != null ? `${input.distanceKm.toFixed(2)} km` : '—')
    row('Duration', input.durationMin != null ? `${input.durationMin} min` : '—')
    row('Speed ceiling', `${input.speedCeilingKmh} km/h`)
    row('Fare', money(input.fareAmount))
    doc.moveDown(0.4)

    heading('Evidence sealed')
    row('Telemetry fixes', String(input.telemetryPoints))
    row('Ledger entries', String(input.ledgerEntries))
    row('Inspection photos', String(input.photos.length))
    row('Safety events', input.anomalies.length === 0 ? 'None recorded' : String(input.anomalies.length))
    doc.moveDown(0.4)

    if (input.anomalies.length > 0) {
      heading('Safety events')
      for (const a of input.anomalies) {
        doc.fillColor(INK).font('Helvetica').fontSize(9)
          .text(`${a.level}  ${a.reason.replace(/_/g, ' ').toLowerCase()}  ·  ${a.at}`)
      }
      doc.moveDown(0.5)
    }

    if (input.photos.length > 0) {
      heading('Inspection photo digests (SHA-256)')
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text('Any alteration to an archived photo changes its digest below.')
      doc.moveDown(0.3)
      for (const p of input.photos) {
        doc.fillColor(INK).font('Helvetica').fontSize(8)
          .text(`${p.phase}  ${ZONE_LABEL[p.zone].padEnd(16)}  ${p.sha256}`)
      }
      doc.moveDown(0.5)
    }

    rule()
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
    doc.text(
      'This certificate is generated from an append-only trip ledger and a ' +
        'time-series telemetry archive. It evidences the route, telematics, fare and ' +
        'vehicle condition photographs recorded for this trip.',
      { align: 'left' },
    )
    doc.moveDown(0.3)
    doc.text(
      'It does not evidence anything not listed above. Verify authenticity by ' +
        'comparing each digest against the archived file.',
    )

    doc.end()
  })
}
