import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: { N: number; r: number; p: number },
) => Promise<Buffer>

// Unlike peppered() in lib/hash.ts, a password is low-entropy and long-lived,
// so it gets a deliberately slow KDF. Only operators have passwords, so the
// cost never lands on the customer auth path.
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  return timingSafeEqual(actual, expected)
}
