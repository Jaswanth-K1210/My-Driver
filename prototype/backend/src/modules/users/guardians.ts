import { pool } from '../../db/client.js'
import { conflict, notFound } from '../../lib/errors.js'

export const MAX_GUARDIANS = 3

export type Guardian = {
  id: string
  name: string
  relation: string | null
  phone: string
  position: number
}

export async function listGuardians(userId: string): Promise<Guardian[]> {
  const { rows } = await pool.query<Guardian>(
    `SELECT id, name, relation, phone, position
       FROM guardian_contacts WHERE user_id = $1 ORDER BY position`,
    [userId],
  )
  return rows
}

export async function addGuardian(
  userId: string,
  input: { name: string; relation?: string; phone: string },
): Promise<Guardian> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Lock this user's rows so two concurrent adds cannot both see two guardians.
    const { rows: taken } = await client.query<{ position: number }>(
      `SELECT position FROM guardian_contacts WHERE user_id = $1 FOR UPDATE`,
      [userId],
    )
    if (taken.length >= MAX_GUARDIANS) {
      throw conflict(
        'GUARDIAN_LIMIT_REACHED',
        `A maximum of ${MAX_GUARDIANS} guardians is allowed`,
      )
    }

    const used = new Set(taken.map((t) => t.position))
    let position = 1
    while (used.has(position)) position++

    const { rows } = await client.query<Guardian>(
      `INSERT INTO guardian_contacts (user_id, name, relation, phone, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, relation, phone, position`,
      [userId, input.name, input.relation ?? null, input.phone, position],
    )
    await client.query('COMMIT')
    return rows[0]!
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateGuardian(
  userId: string,
  id: string,
  patch: { name?: string; relation?: string; phone?: string },
): Promise<Guardian> {
  const { rows } = await pool.query<Guardian>(
    `UPDATE guardian_contacts
        SET name     = COALESCE($3, name),
            relation = COALESCE($4, relation),
            phone    = COALESCE($5, phone)
      WHERE id = $1 AND user_id = $2
      RETURNING id, name, relation, phone, position`,
    [id, userId, patch.name ?? null, patch.relation ?? null, patch.phone ?? null],
  )
  const row = rows[0]
  if (!row) throw notFound('GUARDIAN_NOT_FOUND', 'No such guardian contact')
  return row
}

export async function deleteGuardian(userId: string, id: string): Promise<void> {
  const { rowCount } = await pool.query(
    `DELETE FROM guardian_contacts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  if (rowCount === 0) throw notFound('GUARDIAN_NOT_FOUND', 'No such guardian contact')
}
