import { Link } from 'react-router-dom'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { StatCard } from '../app/Primitives.jsx'
import { LevelBadge, StatusPill } from './Indicators.jsx'
import { dateTime, reasonLabel, rupees, tripRef } from './format.js'

function EventList({ title, icon: Icon, items, empty, render }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/trips/${item.trip_id}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50">
                {render(item)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Earnings, trips and the full safety record for one driver. */
export default function DriverActivity({ activity: a }) {
  if (!a) return null
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Trips completed" value={a.completed} />
        <StatCard label="Earned, 7 days" value={rupees(a.earned_week)} />
        <StatCard label="Earned, all time" value={rupees(a.earned_total)} />
        <StatCard label="Not yet paid out" value={rupees(a.unpaid)} />
        <StatCard label="Escalations" value={a.escalations} danger={a.open_escalations > 0} unit={a.open_escalations ? `${a.open_escalations} open` : null} />
        <StatCard label="SOS raised" value={a.sos} danger={a.sos > 0} />
        <StatCard label="Warnings" value={a.warnings} />
        <StatCard label="Cancelled" value={a.cancelled} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <EventList
          title="Escalations and SOS"
          icon={ShieldAlert}
          items={a.recent_escalations}
          empty="No escalations on this driver's trips."
          render={(e) => (
            <>
              <LevelBadge level={e.level} />
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{reasonLabel(e.reason)}</span>
              <StatusPill status={e.status} />
              <span className="text-xs text-slate-500">{tripRef(e.trip_id)} · {dateTime(e.opened_at)}</span>
            </>
          )}
        />
        <EventList
          title="Automated warnings"
          icon={AlertTriangle}
          items={a.recent_warnings}
          empty="No speed or route warnings."
          render={(w) => (
            <>
              <LevelBadge level={w.level} />
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{reasonLabel(w.reason)}</span>
              <span className="text-xs text-slate-500">{tripRef(w.trip_id)} · {dateTime(w.created_at)}</span>
            </>
          )}
        />
      </div>
    </div>
  )
}
