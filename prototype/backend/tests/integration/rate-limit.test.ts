import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { consumeQuota } from '../../src/lib/rate-limit.js'
import { redis } from '../../src/redis/client.js'
import { resetRedis } from '../helpers/redis.js'

describe('consumeQuota', () => {
  beforeEach(async () => { await resetRedis() })
  afterAll(async () => { await resetRedis() })

  it('allows calls up to the limit', async () => {
    const first = await consumeQuota('test:a', 3, 60)
    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(2)

    await consumeQuota('test:a', 3, 60)
    const third = await consumeQuota('test:a', 3, 60)
    expect(third.allowed).toBe(true)
    expect(third.remaining).toBe(0)
  })

  it('denies the call that exceeds the limit and reports a retry delay', async () => {
    for (let i = 0; i < 3; i++) await consumeQuota('test:b', 3, 60)

    const denied = await consumeQuota('test:b', 3, 60)
    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(0)
    expect(denied.retryAfterSeconds).toBeGreaterThan(0)
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('tracks separate keys independently', async () => {
    for (let i = 0; i < 3; i++) await consumeQuota('test:c', 3, 60)
    expect((await consumeQuota('test:d', 3, 60)).allowed).toBe(true)
  })

  it('sets an expiry so the window actually rolls', async () => {
    await consumeQuota('test:e', 3, 60)
    const ttl = await redis.ttl('quota:test:e')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60)
  })
})
