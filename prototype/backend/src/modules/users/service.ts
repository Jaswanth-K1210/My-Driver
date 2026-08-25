import { pool } from '../../db/client.js'
import { notFound } from '../../lib/errors.js'
import type { Role } from '../auth/otp.js'
import { getUserRoles } from '../auth/service.js'

export type MeResponse = {
  id: string
  role: Role
  roles: Role[]
  phone_number: string | null
  email: string | null
  full_name: string | null
}

export async function getMe(userId: string, role: Role): Promise<MeResponse> {
  const { rows } = await pool.query(
    `SELECT id, phone_number, email, full_name FROM users WHERE id = $1`,
    [userId],
  )
  const user = rows[0]
  if (!user) throw notFound('USER_NOT_FOUND', 'No such user')

  return { ...user, role, roles: await getUserRoles(userId) } as MeResponse
}

export async function updateMe(
  userId: string,
  role: Role,
  patch: { full_name?: string; email?: string },
): Promise<MeResponse> {
  await pool.query(
    `UPDATE users
        SET full_name  = COALESCE($2, full_name),
            email      = COALESCE($3, email),
            updated_at = now()
      WHERE id = $1`,
    [userId, patch.full_name ?? null, patch.email ?? null],
  )
  return getMe(userId, role)
}
