/**
 * Grants a role to an account by phone number.
 *
 * Privileged roles are deliberately not grantable over the API — there is no
 * endpoint that can make someone a Safety Desk agent, because that would be a
 * privilege-escalation surface. Provisioning is an operator action:
 *
 *   npm run grant-role -- +919000000001 SAFETY_DESK_AGENT
 *   npm run grant-role -- +919000000002 SUPER_ADMIN
 *
 * The account must already exist (the person signs in once by OTP first).
 */
import { closeDb, pool } from './client.js'
import { ROLES, type Role } from '../modules/auth/roles.js'

const [phone, role] = process.argv.slice(2)

if (!phone || !role) {
  console.error('usage: npm run grant-role -- <phone_e164> <ROLE>')
  console.error(`roles: ${ROLES.join(', ')}`)
  process.exit(1)
}

if (!(ROLES as readonly string[]).includes(role)) {
  console.error(`Unknown role "${role}". Valid roles: ${ROLES.join(', ')}`)
  process.exit(1)
}

const { rows } = await pool.query<{ id: string; full_name: string | null }>(
  `SELECT id, full_name FROM users WHERE phone_number = $1`,
  [phone],
)

const user = rows[0]
if (!user) {
  console.error(`No account for ${phone}. They must sign in once before a role can be granted.`)
  await closeDb()
  process.exit(1)
}

await pool.query(
  `INSERT INTO user_roles (user_id, role) VALUES ($1, $2::user_role)
   ON CONFLICT (user_id, role) DO UPDATE SET status = 'ACTIVE'`,
  [user.id, role as Role],
)

// Granting a privileged role is itself an auditable event.
await pool.query(
  `INSERT INTO audit_log (actor_id, action, subject, payload)
   VALUES (NULL, 'ROLE_GRANTED', $1, $2::jsonb)`,
  [user.id, JSON.stringify({ role, phone, via: 'cli' })],
)

console.log(`Granted ${role} to ${user.full_name ?? phone} (${user.id})`)
await closeDb()
process.exit(0)
