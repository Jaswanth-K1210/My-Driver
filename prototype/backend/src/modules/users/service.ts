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
  created_at: string
  safety: { set: boolean; speed_limit_kmh: number; share_with_guardians: boolean; prefer_female_driver: boolean }
}

/** Until a customer chooses, a booking alerts the driver above this. */
export const DEFAULT_SPEED_LIMIT_KMH = 60

export async function getMe(userId: string, role: Role): Promise<MeResponse> {
  const { rows } = await pool.query(
    `SELECT id, phone_number, email, full_name, created_at,
            safety_set_at, safety_speed_limit_kmh, safety_share_with_guardians, safety_prefer_female_driver
       FROM users WHERE id = $1`,
    [userId],
  )
  const row = rows[0]
  if (!row) throw notFound('USER_NOT_FOUND', 'No such user')
  const { safety_set_at, safety_speed_limit_kmh, safety_share_with_guardians, safety_prefer_female_driver, ...user } = row

  return {
    ...user,
    role,
    roles: await getUserRoles(userId),
    safety: {
      set: safety_set_at !== null,
      speed_limit_kmh: safety_speed_limit_kmh ?? DEFAULT_SPEED_LIMIT_KMH,
      share_with_guardians: safety_share_with_guardians,
      prefer_female_driver: safety_prefer_female_driver,
    },
  } as MeResponse
}

export async function updateMe(
  userId: string,
  role: Role,
  patch: {
    full_name?: string | undefined
    email?: string | undefined
    safety?: { speed_limit_kmh: number; share_with_guardians: boolean; prefer_female_driver: boolean } | undefined
  },
): Promise<MeResponse> {
  await pool.query(
    `UPDATE users
        SET full_name  = COALESCE($2, full_name),
            email      = COALESCE($3, email),
            updated_at = now()
      WHERE id = $1`,
    [userId, patch.full_name ?? null, patch.email ?? null],
  )
  if (patch.safety) {
    await pool.query(
      `UPDATE users
          SET safety_speed_limit_kmh = $2, safety_share_with_guardians = $3,
              safety_prefer_female_driver = $4, safety_set_at = now(), updated_at = now()
        WHERE id = $1`,
      [userId, patch.safety.speed_limit_kmh, patch.safety.share_with_guardians, patch.safety.prefer_female_driver],
    )
  }
  return getMe(userId, role)
}
