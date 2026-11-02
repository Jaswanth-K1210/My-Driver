import { describe, expect, it } from 'vitest'
import { scrubSentry, scrubString } from '../../src/lib/sentry-scrub.js'

describe('Sentry privacy scrubber', () => {
  it.each([
    ['phone', 'call +91 98765 43210 now', '98765'],
    ['phone, bare', 'driver 9876543210 late', '9876543210'],
    ['PAN', 'PAN ABCDE1234F rejected', 'ABCDE1234F'],
    ['Aadhaar', 'aadhaar 1234 5678 9012 mismatch', '5678'],
    ['OTP', 'OTP: 482913 expired', '482913'],
    ['bearer', 'Authorization: Bearer abc.def.ghi', 'abc.def'],
    ['JWT', 'token eyJhbGciOi.eyJzdWIiOi.c2ln', 'eyJ'],
    ['coordinates', 'stuck at 17.385044,78.486671', '17.385'],
    ['query string', 'GET /v1/locations/search?q=Home&lat=17.38', 'Home'],
  ])('removes %s from strings', (_kind, input, secret) => {
    const out = scrubString(input)
    expect(out).not.toContain(secret)
    expect(out).toContain('[redacted]')
  })

  it('keeps ordinary text, IDs and timestamps', () => {
    const s = 'trip 3f2a9c1e-8b7d-4e6f-a1b2-c3d4e5f6a7b8 failed at 2026-10-30T10:00:00.123Z'
    expect(scrubString(s)).toBe(s)
  })

  it('redacts secret keys, request bodies and cookies in a whole event', () => {
    const event = {
      message: 'boom',
      request: {
        url: 'https://api.example/v1/trips/1/telemetry?ticket=abc',
        data: { points: [{ lat: 17.1, lng: 78.2 }] },
        cookies: { sid: 'x' },
        headers: { authorization: 'Bearer t', 'x-razorpay-signature': 's', 'user-agent': 'k6' },
      },
      extra: { pickup_lat: 17.38, phoneNumber: '9876543210', otp: '123456', nested: [{ pan: 'ABCDE1234F' }] },
      contexts: { trace: { span_id: 'abc123' } },
      tags: { tester: 'user-1' },
    }
    const out = scrubSentry(event) as any
    expect(out.request.data).toBeUndefined()
    expect(out.request.cookies).toBeUndefined()
    expect(out.request.url).not.toContain('ticket')
    expect(out.request.headers).toEqual({ authorization: '[redacted]', 'x-razorpay-signature': '[redacted]', 'user-agent': 'k6' })
    expect(out.extra).toEqual({ pickup_lat: '[redacted]', phoneNumber: '[redacted]', otp: '[redacted]', nested: [{ pan: '[redacted]' }] })
    expect(out.contexts.trace.span_id).toBe('abc123')
    expect(out.tags.tester).toBe('user-1')
  })
})
