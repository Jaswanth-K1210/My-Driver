import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { InspectionPhase, InspectionZone } from './zones.js'
import { ZONE_LABEL } from './zones.js'

export type WatermarkFacts = {
  tripRef: string
  zone: InspectionZone
  phase: InspectionPhase
  capturedAt: Date
  lat?: number | undefined
  lng?: number | undefined
}

export type WatermarkedImage = {
  bytes: Buffer
  sha256: string
  width: number
  height: number
  watermark: Record<string, unknown>
}

const escapeXml = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  )

const istStamp = (at: Date): string =>
  `${at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST`

/**
 * Burns the trip reference, zone, timestamp and coordinates into the bottom of
 * the photo, then hashes the result.
 *
 * The burn-in is what a human sees; the SHA-256 of the *watermarked* bytes is
 * what makes the archive tamper-evident. Any later edit — to the pixels or the
 * caption — changes the digest, and the digest is what the certificate signs.
 */
export async function watermark(
  original: Buffer,
  facts: WatermarkFacts,
): Promise<WatermarkedImage> {
  const image = sharp(original, { failOn: 'none' })
  const meta = await image.metadata()

  const width = meta.width ?? 1280
  const height = meta.height ?? 960

  const coords =
    facts.lat != null && facts.lng != null
      ? `${facts.lat.toFixed(5)}, ${facts.lng.toFixed(5)}`
      : 'location unavailable'

  const lines = [
    `MyDriver ${facts.phase}-trip · ${ZONE_LABEL[facts.zone]}`,
    `${facts.tripRef} · ${istStamp(facts.capturedAt)}`,
    coords,
  ]

  // Scale the caption with the image so it stays legible on any camera size.
  const fontSize = Math.max(12, Math.round(width / 42))
  const pad = Math.round(fontSize * 0.6)
  const bandHeight = fontSize * lines.length + pad * 2.5

  const svg = `<svg width="${width}" height="${height}">
    <rect x="0" y="${height - bandHeight}" width="${width}" height="${bandHeight}"
          fill="rgba(0,0,0,0.62)"/>
    ${lines
      .map(
        (line, i) =>
          `<text x="${pad}" y="${height - bandHeight + pad + fontSize * (i + 0.9)}"
                 font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}"
                 fill="#FFFFFF">${escapeXml(line)}</text>`,
      )
      .join('\n')}
  </svg>`

  const bytes = await image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer()

  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width,
    height,
    watermark: {
      trip_ref: facts.tripRef,
      zone: facts.zone,
      phase: facts.phase,
      captured_at: facts.capturedAt.toISOString(),
      lat: facts.lat ?? null,
      lng: facts.lng ?? null,
      burned_in: true,
    },
  }
}

export const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex')
