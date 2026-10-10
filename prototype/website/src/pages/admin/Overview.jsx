import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, IndianRupee } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import PageHeader from '../../components/admin/PageHeader.jsx'
import { SectionCard, Segmented, StatCard } from '../../components/app/Primitives.jsx'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty } from '../../components/admin/Indicators.jsx'
import BarChart from '../../components/admin/BarChart.jsx'
import { rupees } from '../../components/admin/format.js'

const RANGES = [{ id: 7, label: '7 days' }, { id: 30, label: '30 days' }, { id: 90, label: '90 days' }]
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—')
const compactRupees = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `₹${Math.round(v)}`)

export default function Overview() {
  const [days, setDays] = useState(30)
  const { data, error } = useAdminPoll(() => api.admin.overview(days), 60000, [days])

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="How the service is running: trips, money, safety and the people behind them">
        <Segmented options={RANGES} value={days} onChange={setDays} className="w-full sm:w-72" />
      </PageHeader>

      {error ? (
        <Empty icon={BarChart3} title="Could not load the overview" hint={error.message} />
      ) : !data ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Completed trips" value={data.totals.completed.toLocaleString('en-IN')} />
            <StatCard label="Revenue (net of refunds)" value={rupees(Math.round(data.totals.revenue))} />
            <StatCard label="Platform fees" value={rupees(Math.round(data.totals.platform_fees))} />
            <StatCard label="Average fare" value={rupees(Math.round(data.totals.avg_fare))} />
            <StatCard label="Cancelled" value={pct(data.totals.cancelled, data.totals.requested)} />
            <StatCard label="No driver found" value={pct(data.totals.no_driver, data.totals.requested)} danger={data.totals.no_driver / Math.max(1, data.totals.requested) > 0.1} />
            <StatCard label="Average rating" value={data.totals.avg_rating ? `★ ${data.totals.avg_rating.toFixed(2)}` : '—'} />
            <StatCard label="New customers" value={data.people.new_customers} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Completed trips per day" icon={BarChart3}>
              <BarChart data={data.daily} valueKey="completed" label="Completed trips" />
            </SectionCard>
            <SectionCard title="Revenue per day" icon={IndianRupee}>
              <BarChart data={data.daily} valueKey="revenue" label="Revenue" format={compactRupees} />
            </SectionCard>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Incidents" value={data.safety.escalations} />
            <StatCard label="Emergencies (L4+)" value={data.safety.emergencies} danger={data.safety.emergencies > 0} />
            <StatCard label="Avg time to acknowledge" value={data.safety.avg_ack_minutes != null ? `${data.safety.avg_ack_minutes.toFixed(1)} min` : '—'} />
            <StatCard label="SLA breaches" value={data.safety.sla_breaches} danger={data.safety.sla_breaches > 0} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Drivers who drove" value={data.people.active_drivers} />
            <Link to="/drivers" className="block">
              <StatCard label="Drivers awaiting review" value={data.people.awaiting_review} danger={data.people.awaiting_review > 0} />
            </Link>
            <StatCard label="Trips requested" value={data.totals.requested.toLocaleString('en-IN')} />
            <StatCard label="Period" value={`${days} days`} />
          </div>
        </>
      )}
    </div>
  )
}
