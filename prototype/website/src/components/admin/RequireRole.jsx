import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../../context/authStore.js'

/** Roles permitted at the Safety Desk. Mirrors DESK_ROLES on the backend. */
export const DESK_ROLES = ['SAFETY_DESK_AGENT', 'OPS_MANAGER', 'SUPER_ADMIN']
export const OPS_ROLES = ['OPS_MANAGER', 'SUPER_ADMIN']
export const FINANCE_ROLES = ['FINANCE', 'SUPER_ADMIN']
/** Trip and customer lookup: everyone who answers customers or checks charges. */
export const SUPPORT_ROLES = ['SAFETY_DESK_AGENT', 'OPS_MANAGER', 'FINANCE', 'SUPER_ADMIN']
/** Overview and pricing (viewing). Editing prices is FINANCE / SUPER_ADMIN. */
export const MANAGER_ROLES = ['OPS_MANAGER', 'FINANCE', 'SUPER_ADMIN']

export function hasRole(user, allowed) {
  if (!user) return false
  const held = [user.role, ...(user.roles ?? [])].filter(Boolean)
  return held.some((role) => allowed.includes(role))
}

/**
 * Hides what the signed-in operator cannot use.
 *
 * This is navigation, not security. Every one of these endpoints is guarded
 * independently by requireRole() on the server, which is what actually
 * protects them — this only avoids showing an agent a screen that would
 * answer 403.
 *
 * Renders a refusal panel rather than redirecting: someone who follows a link
 * to a page they cannot open should be told why, not silently bounced to a
 * customer dashboard and left wondering.
 */
export default function RequireRole({ any, children }) {
  const { user } = useAuth()
  if (hasRole(user, any)) return children

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-bold text-slate-900">Not available to your role</h1>
        <p className="mt-2 text-sm text-slate-500">
          This screen requires {any.join(' or ')}. You are signed in as{' '}
          <span className="font-semibold text-slate-700">{user?.role ?? 'unknown'}</span>.
        </p>
      </div>
    </div>
  )
}
