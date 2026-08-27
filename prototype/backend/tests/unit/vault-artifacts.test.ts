import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { renderCertificate } from '../../src/modules/vault/certificate.js'
import { sha256, watermark } from '../../src/modules/vault/watermark.js'

/** A plain red JPEG standing in for a camera capture. */
const makePhoto = (width = 640, height = 480) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 38 } } })
    .jpeg()
    .toBuffer()

describe('inspection photo watermarking', () => {
  it('burns a caption into the image and returns a digest', async () => {
    const original = await makePhoto()
    const marked = await watermark(original, {
      tripRef: 'TRP-ABC123',
      zone: 'FRONT',
      phase: 'PRE',
      capturedAt: new Date('2026-08-28T06:30:00Z'),
      lat: 17.4399,
      lng: 78.3813,
    })

    expect(marked.sha256).toMatch(/^[0-9a-f]{64}$/)
    // The watermark changes the pixels, so the digest cannot match the input.
    expect(marked.sha256).not.toBe(sha256(original))
    expect(marked.watermark.burned_in).toBe(true)
  })

  it('preserves the image dimensions', async () => {
    const marked = await watermark(await makePhoto(800, 600), {
      tripRef: 'TRP-ABC123',
      zone: 'BOOT',
      phase: 'POST',
      capturedAt: new Date(),
    })

    const meta = await sharp(marked.bytes).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(600)
  })

  it('actually darkens the caption band at the foot of the image', async () => {
    const original = await makePhoto(640, 480)
    const marked = await watermark(original, {
      tripRef: 'TRP-ABC123',
      zone: 'DASHBOARD',
      phase: 'PRE',
      capturedAt: new Date(),
      lat: 17.4, lng: 78.4,
    })

    // Sample the bottom strip of both images: the overlay must have made it
    // measurably darker, which is what proves the burn-in is real rather than
    // just metadata claiming it happened.
    const strip = { left: 0, top: 440, width: 640, height: 40 }
    const before = await sharp(original).extract(strip).stats()
    const after = await sharp(marked.bytes).extract(strip).stats()

    expect(after.channels[0]!.mean).toBeLessThan(before.channels[0]!.mean)
  })

  it('records coordinates when supplied, and says so when not', async () => {
    const photo = await makePhoto()
    const withCoords = await watermark(photo, {
      tripRef: 'T', zone: 'SEATS', phase: 'PRE', capturedAt: new Date(), lat: 1.5, lng: 2.5,
    })
    const without = await watermark(photo, {
      tripRef: 'T', zone: 'SEATS', phase: 'PRE', capturedAt: new Date(),
    })

    expect(withCoords.watermark).toMatchObject({ lat: 1.5, lng: 2.5 })
    expect(without.watermark).toMatchObject({ lat: null, lng: null })
  })

  it('is deterministic for identical input', async () => {
    const photo = await makePhoto()
    const facts = {
      tripRef: 'TRP-ABC123',
      zone: 'REAR' as const,
      phase: 'PRE' as const,
      capturedAt: new Date('2026-08-28T06:30:00Z'),
      lat: 17.4, lng: 78.4,
    }
    const a = await watermark(photo, facts)
    const b = await watermark(photo, facts)
    expect(a.sha256).toBe(b.sha256)
  })
})

describe('trip certificate', () => {
  const input = {
    certId: 'MV-2026-ABC123',
    tripRef: 'TRP-ABC123',
    tripId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    issuedAt: new Date('2026-08-28T06:30:00Z'),
    customerName: 'Priya Sharma',
    driverName: 'Ramesh Kumar',
    vehicle: 'Toyota Innova',
    plate: 'TS09 EZ 4412',
    skill: 'MD-Night',
    from: 'Cyber Towers, HITEC City',
    to: 'Financial District Road',
    requestedAt: new Date('2026-08-27T16:30:00Z'),
    completedAt: new Date('2026-08-27T17:10:00Z'),
    distanceKm: 7.24,
    durationMin: 40,
    speedCeilingKmh: 60,
    fareAmount: 165.5,
    telemetryPoints: 812,
    ledgerEntries: 6,
    anomalies: [{ reason: 'SPEED_CEILING_BREACH', level: 'L1', at: '2026-08-27T16:55:00Z' }],
    photos: [
      { zone: 'FRONT' as const, phase: 'PRE', sha256: 'a'.repeat(64), capturedAt: '2026-08-27T16:31:00Z' },
      { zone: 'BOOT' as const, phase: 'POST', sha256: 'b'.repeat(64), capturedAt: '2026-08-27T17:11:00Z' },
    ],
  }

  it('renders a real PDF', async () => {
    const { bytes, sha256: digest } = await renderCertificate(input)

    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(bytes.subarray(-6).toString()).toContain('EOF')
    expect(bytes.length).toBeGreaterThan(1000)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('carries every photo digest, so the archive can be verified', async () => {
    const { bytes } = await renderCertificate(input)
    // PDF text is compressed, so assert on what we can: the document grows with
    // the evidence it lists.
    const { bytes: withoutPhotos } = await renderCertificate({ ...input, photos: [] })
    expect(bytes.length).toBeGreaterThan(withoutPhotos.length)
  })

  it('renders without optional details', async () => {
    const { bytes } = await renderCertificate({
      ...input,
      customerName: null, driverName: null, vehicle: null, plate: null,
      from: null, to: null, completedAt: null,
      distanceKm: null, durationMin: null, fareAmount: null,
      anomalies: [], photos: [],
    })
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
