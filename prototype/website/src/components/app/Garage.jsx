import { useCallback, useEffect, useState } from 'react'
import { Car, Check, Plus, Star, Trash2 } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { cn } from '../../lib/utils.js'
import { SectionCard } from './Primitives.jsx'

const label = (v) => [v.company, v.model].filter(Boolean).join(' ')

/** The customer's saved cars from /v1/me/vehicles. Empty when signed out. */
export function useGarage() {
  const { isAuthenticated } = useAuth()
  const [vehicles, setVehicles] = useState([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setVehicles([])
      setLoaded(true)
      return
    }
    try {
      setVehicles(await api.me.vehicles.list())
    } catch {
      // Non-fatal: the car form still works without the garage.
    } finally {
      setLoaded(true)
    }
  }, [isAuthenticated])

  useEffect(() => {
    void reload()
  }, [reload])

  return { vehicles, loaded, reload, isAuthenticated }
}

/** Saved cars as one-tap choices above the booking form's car fields. */
export function GarageChips({ carDetails, onPick }) {
  const { toast } = useToast()
  const { vehicles, reload, isAuthenticated } = useGarage()
  const [saving, setSaving] = useState(false)

  // Pre-fill with the default car once, on a fresh form.
  useEffect(() => {
    const def = vehicles.find((v) => v.is_default)
    if (def && !carDetails.savedVehicleId && !carDetails.plate) onPick(def)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles])

  if (!isAuthenticated) return null

  const alreadySaved = vehicles.some(
    (v) => v.id === carDetails.savedVehicleId ||
      (v.company === carDetails.company && v.model === carDetails.model && v.transmission === carDetails.transmission && v.engine_type === carDetails.engineType),
  )

  const save = async () => {
    setSaving(true)
    try {
      const v = await api.me.vehicles.add({
        company: carDetails.company,
        model: carDetails.model,
        engine_type: carDetails.engineType,
        transmission: carDetails.transmission,
        ...(carDetails.plate ? { plate: carDetails.plate } : {}),
      })
      toast(`${label(v)} saved to your garage`, 'success')
      await reload()
      onPick(v)
    } catch (err) {
      toast(err?.message ?? 'Could not save this car', 'warning')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700">Your garage</p>
        {!alreadySaved && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save this car'}
          </button>
        )}
      </div>
      {vehicles.length === 0 ? (
        <p className="text-xs text-slate-500">Save your car once and pick it with one tap next time.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {vehicles.map((v) => {
            const on = carDetails.savedVehicleId === v.id
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onPick(v)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
                  on ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', on ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600')}>
                  <Car className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-900">{v.nickname ?? label(v)}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {[v.transmission, v.engine_type, v.plate].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {on && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Profile section: see, set default and remove saved cars. */
export function GarageCard() {
  const { toast } = useToast()
  const { vehicles, loaded, reload } = useGarage()
  const [busy, setBusy] = useState(null)

  const act = async (id, fn, ok) => {
    setBusy(id)
    try {
      await fn()
      toast(ok, 'success')
      await reload()
    } catch (err) {
      toast(err?.message ?? 'Something went wrong', 'warning')
    } finally {
      setBusy(null)
    }
  }

  return (
    <SectionCard title={`Garage · ${vehicles.length}`} icon={Car}>
      {!loaded ? (
        <p className="py-4 text-sm text-slate-500">Loading your cars…</p>
      ) : vehicles.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">No saved cars yet. Save one from the booking form and it appears here.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {vehicles.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Car className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">
                  {v.nickname ?? label(v)}
                  {v.is_default && <span className="ml-2 rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Default</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {[v.nickname ? label(v) : null, v.transmission, v.engine_type, v.plate].filter(Boolean).join(' · ')}
                </p>
              </div>
              {!v.is_default && (
                <button
                  type="button"
                  disabled={busy === v.id}
                  onClick={() => act(v.id, () => api.me.vehicles.update(v.id, { is_default: true }), 'Default car updated')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Star className="h-3.5 w-3.5" aria-hidden="true" /> Make default
                </button>
              )}
              <button
                type="button"
                aria-label={`Remove ${label(v)}`}
                disabled={busy === v.id}
                onClick={() => act(v.id, () => api.me.vehicles.remove(v.id), 'Car removed')}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
