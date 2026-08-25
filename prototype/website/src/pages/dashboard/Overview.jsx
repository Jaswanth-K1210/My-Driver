import { Link } from 'react-router-dom'
import { Archive, ArrowRight, CarFront, Gauge, Radio, ShieldCheck, TrendingUp } from 'lucide-react'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { useAuth } from '../../context/authStore.js'
import { useTrip } from '../../context/tripStore.js'
import { formatINR } from '../../lib/utils.js'

function QuickAction({ to, icon: Icon, title, description, primary }) {
  return (
    <Link
      to={to}
      className={
        primary
          ? 'group flex items-start gap-4 rounded-3xl bg-brand-500 p-6 text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600'
          : 'group flex items-start gap-4 rounded-3xl border border-slate-200 bg-white p-6 transition-colors hover:border-brand-200'
      }
    >
      <span
        className={
          primary
            ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15'
            : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600'
        }
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={primary ? 'block font-bold' : 'block font-bold text-slate-900'}>{title}</span>
        <span className={primary ? 'mt-1 block text-sm text-white/80' : 'mt-1 block text-sm text-slate-500'}>
          {description}
        </span>
      </span>
      <ArrowRight
        className={
          primary
            ? 'h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1'
            : 'h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1'
        }
        aria-hidden="true"
      />
    </Link>
  )
}

export default function Overview() {
  const { user } = useAuth()
  const { vaultTrips, hasActiveTrip, trip } = useTrip()

  const totalSpend = vaultTrips.reduce((sum, t) => sum + (t.fare ?? 0), 0)
  const totalKm = vaultTrips.reduce((sum, t) => sum + (Number(t.distanceKm) || 0), 0)
  const avgCeiling = vaultTrips.length
    ? Math.round(vaultTrips.reduce((sum, t) => sum + (t.ceiling ?? 0), 0) / vaultTrips.length)
    : 60

  const summaryStats = [
    { icon: Archive, label: 'Sealed trips', value: String(vaultTrips.length) },
    { icon: TrendingUp, label: 'Total spend', value: formatINR(totalSpend) },
    { icon: ShieldCheck, label: 'Distance', value: `${totalKm.toFixed(0)} km` },
    { icon: Gauge, label: 'Avg ceiling', value: `${avgCeiling} km/h` },
  ]

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-slate-500">Good evening</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">{user.name}</h1>
      </header>

      {hasActiveTrip && trip && (
        <Link
          to="/app/track"
          className="flex items-center gap-4 rounded-3xl border border-brand-200 bg-brand-50 p-6 transition-colors hover:border-brand-300"
        >
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white">
            <Radio className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-slate-900">Trip {trip.id} is live</span>
            <span className="mt-0.5 block truncate text-sm text-slate-600">
              {trip.from} → {trip.to}
              {trip.driver ? ` · ${trip.driver.name}` : ''}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <QuickAction primary to="/app/book" icon={CarFront} title="Book a ride" description="By location or by the hour" />
        <QuickAction to="/app/track" icon={Radio} title="Live tracking" description="Follow your driver in real time" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryStats.map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-slate-200 bg-white p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <stat.icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <p className={`mt-4 text-2xl font-black tracking-tight ${stat.danger ? 'text-brand-600' : 'text-slate-900'}`}>
              {stat.value}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <SectionCard
        title="Recent trips"
        icon={Archive}
        action={
          <Link to="/app/vault" className="text-xs font-bold text-brand-600 hover:text-brand-700">
            View all
          </Link>
        }
      >
        {vaultTrips.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            No trips yet — book your first ride to start your archive.
          </p>
        )}
        <ul className="divide-y divide-slate-200">
          {vaultTrips.slice(0, 4).map((t) => (
            <li key={t.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[10px] font-black text-slate-600">
                {t.skill.replace('MD-', '')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">
                  {t.from} → {t.to}
                </span>
                <span className="block truncate text-xs text-slate-500">{t.date}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-black text-slate-900">{formatINR(t.fare)}</span>
                <span className="block text-[10px] font-bold text-slate-400">
                  {Number(t.distanceKm).toFixed(1)} km
                </span>
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}
