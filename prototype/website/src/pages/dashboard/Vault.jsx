import { useEffect, useState } from 'react'
import PageHeader from '../../components/app/PageHeader.jsx'
import { Archive, BadgeCheck, Download } from 'lucide-react'
import { Modal } from '../../components/app/Primitives.jsx'
import { useTrip } from '../../context/tripStore.js'
import { useToast } from '../../context/toastStore.js'
import { api } from '../../lib/apiClient.js'
import { formatINR } from '../../lib/utils.js'

const PHASES = [
  { id: 'PRE', label: 'Pre-trip' },
  { id: 'POST', label: 'Post-trip' },
]

/** Loads one sealed trip's evidence: inspection photos and the certificate. */
function TripDetail({ trip }) {
  const { toast } = useToast()
  const [photos, setPhotos] = useState(null)
  const [cert, setCert] = useState(null)
  const [issuing, setIssuing] = useState(false)

  useEffect(() => {
    let live = true
    api.trips
      .vaultPhotos(trip.serverId)
      .then((rows) => live && setPhotos(rows))
      .catch(() => live && setPhotos([]))
    return () => {
      live = false
    }
  }, [trip.serverId])

  const openCertificate = async () => {
    setIssuing(true)
    try {
      const c = cert ?? (await api.trips.certificate(trip.serverId))
      setCert(c)
      window.open(c.url, '_blank', 'noopener')
    } catch (err) {
      toast(err?.message ?? 'Certificate is not available for this trip', 'warning')
    } finally {
      setIssuing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-900">{trip.date}</p>
          <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-black text-brand-600">{trip.skill}</span>
        </div>
        <p className="mt-3 text-base font-semibold text-slate-800">
          {trip.from} <span className="text-slate-400">→</span> {trip.to}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          Driver {trip.driverName} · {formatINR(trip.fare)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Distance', value: `${Number(trip.distanceKm).toFixed(1)} km` },
          { label: 'Ceiling', value: `${trip.ceiling} km/h` },
          { label: 'Duration', value: trip.durationMin ? `${trip.durationMin} min` : '—' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-base font-black text-slate-900">{stat.value}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {PHASES.map((phase) => {
        const shots = (photos ?? []).filter((p) => p.phase === phase.id)
        return (
          <section key={phase.id}>
            <h3 className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
              <span>{phase.label} inspection</span>
              <span className="normal-case">
                {photos === null ? 'Loading…' : shots.length === 0 ? 'Not recorded' : `${shots.length}/8 zones`}
              </span>
            </h3>
            {shots.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {shots.map((shot) => (
                  <a
                    key={shot.zone}
                    href={shot.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`SHA-256 ${shot.sha256}`}
                    className="group overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img src={shot.url} alt={`${phase.label} ${shot.zone}`} loading="lazy" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                    <span className="block truncate px-1.5 py-1 text-[10px] font-bold text-slate-600">
                      {shot.zone.replaceAll('_', ' ').toLowerCase()}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <section className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Trip certificate</p>
            <p className="truncate text-xs text-slate-600">
              {cert ? `${cert.cert_id} · SHA-256 ${cert.sha256.slice(0, 16)}…` : 'Signed PDF with route, fare and inspection digests'}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={issuing}
          onClick={openCertificate}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-sm font-black text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {issuing ? 'Preparing…' : 'Open PDF certificate'}
        </button>
      </section>
    </div>
  )
}

export default function Vault() {
  const { vaultTrips } = useTrip()
  const [detail, setDetail] = useState(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trip Vault"
        subtitle={`${vaultTrips.length} sealed ${vaultTrips.length === 1 ? 'trip' : 'trips'} · route, inspection photos and certificate for each`}
      />

      {vaultTrips.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
          <Archive className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-4 text-base font-bold text-slate-900">No sealed trips yet</p>
          <p className="mt-1 text-sm text-slate-600">
            When a trip ends, its route, inspection photos and certificate are sealed here.
          </p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {vaultTrips.map((trip) => {
          return (
            <li key={trip.id}>
              <button
                type="button"
                onClick={() => setDetail(trip)}
                className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-left transition-colors hover:border-brand-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">
                    {trip.from} → {trip.to}
                  </p>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                    Sealed
                  </span>
                </div>
                <p className="mt-1.5 truncate text-sm text-slate-500">{trip.date}</p>
                <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                  <span className="rounded-md bg-slate-100 px-2 py-1">{trip.skill}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1">
                    {Number(trip.distanceKm).toFixed(1)} km
                  </span>
                  <span className="ml-auto text-sm font-black text-slate-900">{formatINR(trip.fare)}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Sealed trip record">
        {detail && <TripDetail trip={detail} />}
      </Modal>
    </div>
  )
}
