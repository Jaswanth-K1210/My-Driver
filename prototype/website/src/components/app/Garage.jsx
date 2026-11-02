import { useCallback, useEffect, useState } from 'react'
import { Car, Plus, Star, Trash2, X } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { SectionCard } from './Primitives.jsx'
import { CAR_BRANDS, ENGINE_TYPES, TRANSMISSIONS } from '../../data/mock.js'

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

const ADD_NEW = '__add_new__'
const describe = (v) => [v.nickname ?? label(v), v.transmission, v.engine_type, v.plate].filter(Boolean).join(' · ')

/**
 * The booking form's car: a dropdown of the customer's saved cars, ending in
 * "Add a new car". Picking a saved car is enough; adding one shows the car
 * fields (`children`) and offers to keep it in the garage.
 */
export function SavedCarSelect({ carDetails, onPick, onAddNew, children }) {
  const { toast } = useToast()
  const { vehicles, loaded, reload, isAuthenticated } = useGarage()
  const [saving, setSaving] = useState(false)

  // Pre-fill with the default (or only) car once, on a fresh form.
  useEffect(() => {
    if (carDetails.savedVehicleId || carDetails.plate) return
    const def = vehicles.find((v) => v.is_default) ?? (vehicles.length === 1 ? vehicles[0] : null)
    if (def) onPick(def)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles])

  const adding = !carDetails.savedVehicleId

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
    <div className="space-y-4">
      {isAuthenticated && (
        <div>
          <label htmlFor="booking-car" className="mb-1.5 block text-xs font-bold text-slate-700">Choose your car</label>
          <div className="relative">
            <Car className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <select
              id="booking-car"
              value={adding ? ADD_NEW : carDetails.savedVehicleId}
              onChange={(e) => {
                if (e.target.value === ADD_NEW) return onAddNew()
                const v = vehicles.find((x) => x.id === e.target.value)
                if (v) onPick(v)
              }}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-9 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-500 focus:outline-none"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{describe(v)}{v.is_default ? ' (default)' : ''}</option>
              ))}
              <option value={ADD_NEW}>+ Add a new car</option>
            </select>
          </div>
          {loaded && vehicles.length === 0 && (
            <p className="mt-1.5 text-xs text-slate-500">No saved cars yet. Add yours below and save it to pick it in one tap next time.</p>
          )}
        </div>
      )}

      {loaded && adding && (
        <>
          {children}
          {isAuthenticated && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? 'Saving…' : 'Save to my garage'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-brand-500 focus:outline-none'
const CUSTOM_BRAND = 'Other / Custom'

/** Add a car to the garage from the profile, without starting a booking. */
function AddCarForm({ firstCar, onDone, onCancel }) {
  const { toast } = useToast()
  const [car, setCar] = useState(() => ({
    nickname: '',
    company: CAR_BRANDS[0].company,
    model: CAR_BRANDS[0].models[0] ?? '',
    engine_type: ENGINE_TYPES[0],
    transmission: TRANSMISSIONS[0],
    plate: '',
    is_default: firstCar,
  }))
  const [saving, setSaving] = useState(false)
  const brand = CAR_BRANDS.find((b) => b.company === car.company)
  const set = (patch) => setCar((prev) => ({ ...prev, ...patch }))

  const submit = async (e) => {
    e.preventDefault()
    if (!car.model.trim()) return toast('Enter the car model', 'warning')
    setSaving(true)
    try {
      const v = await api.me.vehicles.add({
        company: car.company,
        model: car.model.trim(),
        engine_type: car.engine_type,
        transmission: car.transmission,
        ...(car.nickname.trim() ? { nickname: car.nickname.trim() } : {}),
        ...(car.plate.trim() ? { plate: car.plate.trim() } : {}),
        ...(car.is_default ? { is_default: true } : {}),
      })
      toast(`${label(v)} added to your garage`, 'success')
      onDone()
    } catch (err) {
      toast(err?.message ?? 'Could not add this car', 'warning')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">Add a car</p>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">
          Make
          <select
            className={`${field} mt-1`}
            value={car.company}
            onChange={(e) => {
              const b = CAR_BRANDS.find((x) => x.company === e.target.value)
              set({ company: e.target.value, model: b?.models[0] ?? '' })
            }}
          >
            {CAR_BRANDS.map((b) => <option key={b.company} value={b.company}>{b.company}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Model
          {car.company === CUSTOM_BRAND || !brand?.models.length ? (
            <input className={`${field} mt-1`} value={car.model} placeholder="Car model" onChange={(e) => set({ model: e.target.value })} />
          ) : (
            <select className={`${field} mt-1`} value={car.model} onChange={(e) => set({ model: e.target.value })}>
              {brand.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </label>
        <label className="text-xs font-bold text-slate-700">
          Fuel
          <select className={`${field} mt-1`} value={car.engine_type} onChange={(e) => set({ engine_type: e.target.value })}>
            {ENGINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Transmission
          <select className={`${field} mt-1`} value={car.transmission} onChange={(e) => set({ transmission: e.target.value })}>
            {TRANSMISSIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Number plate <span className="font-medium text-slate-400">(optional)</span>
          <input
            className={`${field} mt-1 uppercase`}
            value={car.plate}
            maxLength={16}
            placeholder="TS 09 EA 4120"
            onChange={(e) => set({ plate: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="text-xs font-bold text-slate-700">
          Nickname <span className="font-medium text-slate-400">(optional)</span>
          <input className={`${field} mt-1`} value={car.nickname} maxLength={40} placeholder="Dad's car" onChange={(e) => set({ nickname: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={car.is_default} onChange={(e) => set({ is_default: e.target.checked })} className="h-4 w-4 accent-brand-500" />
          Use as my default car when booking
        </label>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Adding…' : 'Add car'}
        </button>
      </div>
    </form>
  )
}

/** Profile section: add, see, set default and remove saved cars. */
export function GarageCard() {
  const { toast } = useToast()
  const { vehicles, loaded, reload } = useGarage()
  const [busy, setBusy] = useState(null)
  const [adding, setAdding] = useState(false)

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
    <SectionCard
      title={`Garage · ${vehicles.length}`}
      icon={Car}
      action={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 text-xs font-bold text-brand-700 hover:bg-brand-100"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add a car
          </button>
        )
      }
    >
      {adding && (
        <AddCarForm
          firstCar={vehicles.length === 0}
          onCancel={() => setAdding(false)}
          onDone={async () => {
            setAdding(false)
            await reload()
          }}
        />
      )}
      {!loaded ? (
        <p className="py-4 text-sm text-slate-500">Loading your cars…</p>
      ) : vehicles.length === 0 ? (
        !adding && <p className="py-4 text-sm text-slate-500">No saved cars yet. Add one here, or save one while booking.</p>
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
