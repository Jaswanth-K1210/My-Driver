/**
 * Creates (or resets) one real staff account for the admin portal:
 *
 *   node dist/db/create-staff.js ops.lead@mydriver.in OPS_MANAGER "Priya Iyer"
 *   npm run create-staff -- ops.lead@mydriver.in OPS_MANAGER "Priya Iyer"   (dev)
 *
 * A random password is printed once, to this terminal only. Nothing is written
 * to disk. Running it again for the same email resets that password, which is
 * how a forgotten password is recovered. Provisioning is audited.
 */
import { randomBytes } from 'node:crypto'
import { hashPassword } from '../lib/password.js'
import { ROLES, type Role } from '../modules/auth/roles.js'
import { closeDb, pool } from './client.js'

const STAFF_ROLES = ROLES.filter((r) => !['CUSTOMER', 'DRIVER', 'AGENT'].includes(r))
const [email, role, ...nameParts] = process.argv.slice(2)
const name = nameParts.join(' ').trim()

if (!email || !role || !name) {
  console.error('usage: create-staff <email> <ROLE> "<Full name>"')
  console.error(`staff roles: ${STAFF_ROLES.join(', ')}`)
  process.exit(1)
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`"${email}" is not an email address`)
  process.exit(1)
}
if (!(STAFF_ROLES as readonly string[]).includes(role)) {
  console.error(`"${role}" is not a staff role. Use one of: ${STAFF_ROLES.join(', ')}`)
  process.exit(1)
}

const password = randomBytes(15).toString('base64url')
const { rows } = await pool.query<{ id: string }>(
  `INSERT INTO users (email, full_name, password_hash) VALUES (lower($1), $2, $3)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, updated_at = now()
   RETURNING id`,
  [email, name, await hashPassword(password)],
)
const id = rows[0]!.id
await pool.query(
  `INSERT INTO user_roles (user_id, role) VALUES ($1, $2::user_role)
   ON CONFLICT (user_id, role) DO UPDATE SET status = 'ACTIVE'`,
  [id, role as Role],
)
await pool.query(
  `INSERT INTO audit_log (actor_id, action, subject, payload) VALUES (NULL, 'STAFF_PROVISIONED', $1, $2::jsonb)`,
  [id, JSON.stringify({ role, email: email.toLowerCase(), via: 'create-staff' })],
)

console.log(`\n${role} account ready for ${email.toLowerCase()}`)
console.log(`one-time password: ${password}`)
console.log('Share it securely; it is not stored anywhere in readable form.\n')
await closeDb()
