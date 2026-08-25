import { describe, expect, it } from 'vitest'
import { parseClientFrame } from '../../src/realtime/protocol.js'

const tripId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'

const driverFrame = {
  type: 'DRIVER_TELEMETRY',
  trip_id: tripId,
  timestamp: 1787305851236,
  coords: { lat: 17.4399, lng: 78.3813, speed: 48.5, heading: 182.4 },
  sensors: { accel_z: 0.12, gyro_z: 0.04 },
}

describe('parseClientFrame', () => {
  it('parses each valid client frame', () => {
    expect(parseClientFrame(JSON.stringify({ type: 'SUBSCRIBE', trip_id: tripId })).type)
      .toBe('SUBSCRIBE')
    expect(parseClientFrame(JSON.stringify({ type: 'UNSUBSCRIBE', trip_id: tripId })).type)
      .toBe('UNSUBSCRIBE')
    expect(parseClientFrame(JSON.stringify(driverFrame)).type).toBe('DRIVER_TELEMETRY')
    expect(parseClientFrame(JSON.stringify({ type: 'PONG' })).type).toBe('PONG')
  })

  it('rejects an unknown message type', () => {
    expect(() => parseClientFrame(JSON.stringify({ type: 'HACK', trip_id: tripId }))).toThrow()
  })

  it('rejects telemetry missing coords', () => {
    const { coords, ...withoutCoords } = driverFrame
    expect(() => parseClientFrame(JSON.stringify(withoutCoords))).toThrow()
  })

  it('rejects an out-of-range latitude', () => {
    const bad = { ...driverFrame, coords: { ...driverFrame.coords, lat: 999 } }
    expect(() => parseClientFrame(JSON.stringify(bad))).toThrow()
  })

  it('rejects a non-uuid trip id', () => {
    expect(() => parseClientFrame(JSON.stringify({ type: 'SUBSCRIBE', trip_id: 'abc' }))).toThrow()
  })

  it('rejects an unknown extra key', () => {
    expect(() =>
      parseClientFrame(JSON.stringify({ type: 'SUBSCRIBE', trip_id: tripId, mode: 'MODE_F' })),
    ).toThrow()
  })

  it('throws INVALID_FRAME on malformed JSON', () => {
    try {
      parseClientFrame('{not json')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('INVALID_FRAME')
    }
  })
})
