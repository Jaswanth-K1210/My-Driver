import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { scrubSentry, scrubString } from '../src/lib/sentry-scrub.js'

describe('Customer App · src/lib/sentry-scrub.js (Sentry Privacy Filter)', () => {
  it('redacts phone numbers, PAN, Aadhaar, OTPs, bearer tokens, JWTs, coordinates, and query strings', () => {
    for (const [input, secret] of [
      ['call +91 98765 43210 now', '98765'],
      ['driver 9876543210 late', '9876543210'],
      ['PAN ABCDE1234F rejected', 'ABCDE1234F'],
      ['aadhaar 1234 5678 9012 mismatch', '5678'],
      ['OTP: 482913 expired', '482913'],
      ['Authorization: Bearer abc.def.ghi', 'abc.def'],
      ['token eyJhbGciOi.eyJzdWIiOi.c2ln', 'eyJ'],
      ['stuck at 17.385044,78.486671', '17.385'],
      ['/dashboard/book?pickup=Home&lat=17.38', 'Home'],
    ]) {
      assert.ok(!scrubString(input).includes(secret), `failed to scrub: ${input}`)
    }
  })

  it('preserves trip UUIDs and ISO timestamps untouched', () => {
    const keep = 'trip 3f2a9c1e-8b7d-4e6f-a1b2-c3d4e5f6a7b8 failed at 2026-10-30T10:00:00.123Z'
    assert.equal(scrubString(keep), keep)
  })

  it('strips request bodies/cookies and redacts secret keys in beforeSend / beforeSendSpan payloads', () => {
    const out = scrubSentry({
      request: {
        url: 'https://mydriver.in/track?ticket=abc',
        data: { lat: 1 },
        cookies: { a: 1 },
        headers: { Authorization: 'x' },
      },
      extra: {
        pickupLat: 17.38,
        phone_number: '9876543210',
        otp: '1',
        nested: [{ pan: 'x' }],
        ok: 'fine',
      },
      contexts: { trace: { span_id: 'abc' } },
    })
    assert.equal(out.request.data, undefined)
    assert.equal(out.request.cookies, undefined)
    assert.ok(!out.request.url.includes('ticket'))
    assert.equal(out.request.headers.Authorization, '[redacted]')
    assert.deepEqual(out.extra, {
      pickupLat: '[redacted]',
      phone_number: '[redacted]',
      otp: '[redacted]',
      nested: [{ pan: '[redacted]' }],
      ok: 'fine',
    })
    assert.equal(out.contexts.trace.span_id, 'abc')
  })

  it('stays in sync with website and backend sentry-scrub rules', () => {
    const userScrub = new URL('../src/lib/sentry-scrub.js', import.meta.url)
    const webScrub = new URL('../../../website/src/lib/sentry-scrub.js', import.meta.url)
    const backendScrub = new URL('../../../backend/src/lib/sentry-scrub.ts', import.meta.url)

    const extractRules = (src) =>
      src
        .slice(src.indexOf('const SECRET_WORDS'), src.indexOf('export const scrubString'))
        .replace(/: \[RegExp, string\]\[\]/, '')
        .replace(/\(key: string\): boolean/, '(key)')
        .replace(/\r\n/g, '\n')

    if (existsSync(webScrub)) {
      assert.equal(
        extractRules(readFileSync(userScrub, 'utf8')),
        extractRules(readFileSync(webScrub, 'utf8')),
        'customer app and website sentry-scrub rules must match',
      )
    }
    if (existsSync(backendScrub)) {
      assert.equal(
        extractRules(readFileSync(userScrub, 'utf8')),
        extractRules(readFileSync(backendScrub, 'utf8')),
        'customer app and backend sentry-scrub rules must match',
      )
    }
  })
})
