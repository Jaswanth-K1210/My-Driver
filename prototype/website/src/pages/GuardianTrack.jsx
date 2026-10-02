import { useParams } from 'react-router-dom'
import { Gauge, ShieldAlert, ShieldCheck } from 'lucide-react'
import RoadMap from '../components/app/RoadMap.jsx'
import { useAdminPoll } from '../components/admin/useAdminPoll.js'
import { Wordmark } from '../components/marketing/Navbar.jsx'
import { api } from '../lib/apiClient.js'
import { cn } from '../lib/utils.js'

const ENDED = ['COMPLETED', 'CANCELLED']

/**
 * The page a guardian opens from the texted link. No login: the unguessable
 * token is the credential, and it stops working when the trip ends or the
 * customer revokes it.
 */
export default function GuardianTrack() {
  const { token } = useParams()
  // Same polling hook as the admin board: pauses in a background tab.
  const { data, error } = useAdminPoll(() => api.track(token), 5000, [token])

  if (error && !data) {
    return (
      <Shell>
        <ShieldAlert className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-bold text-slate-900">This link is no longer active</h1>
        <p className="mt-2 text-sm text-slate-500">The trip has ended, or the rider stopped sharing it.</p>
      </Shell>
    )
  }
  if (!data) return <Shell><p className="text-sm text-slate-500">Loading live trip…</p></Shell>

  const ended = ENDED.includes(data.status)
  const points = data.coords
    ? [{ id: 'driver', ...data.coords, color: data.over_ceiling ? '#dc2626' : '#2563eb', label: 'Driver' }]
    : []

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Wordmark />
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <ShieldCheck className="h-4 w-4 text-brand-500" aria-hidden="true" />
          Monitored by the MyDriver Safety Desk
        </span>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            {ended ? 'Trip has ended' : 'Live trip'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.driver_first_name ?? 'Driver'}
            {data.vehicle ? ` · ${data.vehicle}` : ''}
            {data.updated_at ? ` · updated ${new Date(data.updated_at).toLocaleTimeString('en-IN')}` : ''}
          </p>
        </div>

        <div className="relative h-[60vh] min-h-72 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <RoadMap points={points} className="h-full w-full" label="Driver location" />
          {!data.coords && (
            <p className="absolute inset-x-4 top-4 z-10 rounded-xl bg-white/90 p-3 text-center text-sm text-slate-600">
              Waiting for the driver's first GPS fix…
            </p>
          )}
        </div>

        <div
          className={cn(
            'flex items-center gap-3 rounded-2xl border p-4',
            data.over_ceiling ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white',
          )}
        >
          <Gauge className={cn('h-6 w-6', data.over_ceiling ? 'text-red-600' : 'text-slate-400')} aria-hidden="true" />
          <p className="text-sm text-slate-700">
            <span className="text-lg font-black text-slate-900">
              {data.speed_kmh != null ? Math.round(data.speed_kmh) : '–'} km/h
            </span>{' '}
            · limit {data.speed_ceiling_kmh} km/h
            {data.over_ceiling && <span className="ml-2 font-bold text-red-700">Over the limit. The Safety Desk is alerted.</span>}
          </p>
        </div>
      </main>
    </div>
  )
}

function Shell({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center">{children}</div>
    </div>
  )
}
