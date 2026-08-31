import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Bus,
  Calendar,
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Gauge,
  Info,
  MapPin,
  Minus,
  Navigation,
  Plane,
  Plus,
  ShieldCheck,
  Sparkles,
  Tent,
} from 'lucide-react'
import {
  AIRPORT_LOCATIONS,
  CAR_BRANDS,
  CITY_LOCATIONS,
  DROPS,
  ENGINE_TYPES,
  HOUR_PACKAGES,
  INTERCITY_DESTINATIONS,
  PICKUP,
  PICKUP_TIMES,
  REQUIREMENTS,
  SAVED_GARAGE,
  SKILLS,
  TRANSMISSIONS,
  VEHICLE_TYPES,
  VISION_MODES,
  START_LOCATIONS,
} from '../../data/mock.js'
import { getMinDurationForConfig, getRecommendedSkillId, getRouteLegTelemetry } from '../../lib/booking.js'
import { clamp, cn } from '../../lib/utils.js'

/* ── 1. Vehicle Type Selector ───────────────────────────────────────────── */

export function VehicleTypeSelector({ value, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {VEHICLE_TYPES.map((v) => {
        const isSelected = v.id === value
        const isAvailable = v.available

        return (
          <button
            key={v.id}
            type="button"
            disabled={!isAvailable}
            onClick={() => isAvailable && onChange(v.id)}
            className={cn(
              'group relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all',
              isSelected
                ? 'border-brand-500 bg-brand-50/70 shadow-sm ring-2 ring-brand-500/20'
                : isAvailable
                  ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  : 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                  isSelected
                    ? 'bg-brand-500 text-white'
                    : isAvailable
                      ? 'bg-slate-100 text-slate-700 group-hover:bg-brand-50 group-hover:text-brand-600'
                      : 'bg-slate-100 text-slate-400',
                )}
              >
                {v.id === 'car' && <Car className="h-5 w-5" />}
                {v.id === 'bus' && <Bus className="h-5 w-5" />}
                {v.id === 'caravan' && <Tent className="h-5 w-5" />}
              </div>

              {v.badge ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
                  {v.badge}
                </span>
              ) : isSelected ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                  <Check className="h-3 w-3" />
                </span>
              ) : null}
            </div>

            <div className="mt-3">
              <span
                className={cn(
                  'block text-base font-bold',
                  isSelected ? 'text-brand-900' : isAvailable ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                {v.label}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500 line-clamp-1">{v.description}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ── 2. Car Specs & Garage Picker ───────────────────────────────────────── */

export function CarSpecPicker({ carDetails, onChange, onAutoMatchSkill }) {
  const [showCustomModal, setShowCustomModal] = useState(false)
  const currentBrand = CAR_BRANDS.find((b) => b.company === carDetails.company) ?? CAR_BRANDS[0]

  const handleSavedSelect = (saved) => {
    const updated = {
      company: saved.company,
      model: saved.model,
      engineType: saved.engineType,
      transmission: saved.transmission,
      plate: saved.plate,
      isCustom: false,
      savedVehicleId: saved.id,
    }
    onChange(updated)
    if (onAutoMatchSkill) onAutoMatchSkill(updated)
  }

  const handleFieldChange = (field, value) => {
    let updated = { ...carDetails, [field]: value, savedVehicleId: null }
    // If brand changes, default model to first available model of that brand
    if (field === 'company') {
      const brand = CAR_BRANDS.find((b) => b.company === value)
      if (brand && brand.models.length > 0) {
        updated.model = brand.models[0]
      }
    }
    onChange(updated)
    if (onAutoMatchSkill) onAutoMatchSkill(updated)
  }

  return (
    <div className="space-y-4">
      {/* Saved Garage Chips */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            My Garage (Saved Vehicles)
          </label>
          <span className="text-[11px] text-slate-400">Pre-configured & verified</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {SAVED_GARAGE.map((v) => {
            const isSelected = carDetails.savedVehicleId === v.id
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => handleSavedSelect(v)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all',
                  isSelected
                    ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                    : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white',
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    isSelected ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-700',
                  )}
                >
                  <Car className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-900">
                    {v.company} {v.model}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">
                    {v.transmission} · {v.engineType} · {v.plate}
                  </span>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Manual / Custom Car Specs Details */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Company Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">Car Brand / Company</label>
            <div className="relative">
              <select
                value={carDetails.company}
                onChange={(e) => handleFieldChange('company', e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-500 focus:outline-none"
              >
                {CAR_BRANDS.map((b) => (
                  <option key={b.company} value={b.company}>
                    {b.company}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Model Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">Car Model</label>
            <div className="relative">
              {carDetails.company === 'Other / Custom' ? (
                <input
                  type="text"
                  value={carDetails.model}
                  placeholder="Enter car model"
                  onChange={(e) => handleFieldChange('model', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-500 focus:outline-none"
                />
              ) : (
                <>
                  <select
                    value={carDetails.model}
                    onChange={(e) => handleFieldChange('model', e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-500 focus:outline-none"
                  >
                    {currentBrand.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Engine Type & Transmission Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Engine Type */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">Engine Type</label>
            <div className="flex flex-wrap gap-1.5">
              {ENGINE_TYPES.map((eng) => {
                const active = carDetails.engineType === eng
                return (
                  <button
                    key={eng}
                    type="button"
                    onClick={() => handleFieldChange('engineType', eng)}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all',
                      active
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100',
                    )}
                  >
                    {eng}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Transmission */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">Transmission</label>
            <div className="grid grid-cols-2 gap-2">
              {TRANSMISSIONS.map((trans) => {
                const active = carDetails.transmission === trans
                return (
                  <button
                    key={trans}
                    type="button"
                    onClick={() => handleFieldChange('transmission', trans)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all',
                      active
                        ? 'bg-brand-500 text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100',
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {trans}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 3. Requirement Selector ────────────────────────────────────────────── */

export function RequirementSelector({ value, onChange, onAutoMatchSkill }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {REQUIREMENTS.map((r) => {
        const isSelected = r.id === value
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              onChange(r.id)
              if (onAutoMatchSkill) onAutoMatchSkill(r.id)
            }}
            className={cn(
              'group relative flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition-all overflow-hidden',
              isSelected
                ? 'border-brand-500 bg-brand-50/60 shadow-sm ring-1 ring-brand-500/30'
                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white hover:shadow-sm',
            )}
          >
            {isSelected && (
              <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </span>
            )}
            <div
              className={cn(
                'mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                isSelected
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'bg-white text-slate-500 shadow-sm border border-slate-100 group-hover:bg-brand-50 group-hover:text-brand-600',
              )}
            >
              {r.id === 'within_city' && <MapPin className="h-5 w-5" />}
              {r.id === 'inter_city' && <Compass className="h-5 w-5" />}
              {r.id === 'airport' && <Plane className="h-5 w-5" />}
              {r.id === 'full_time' && <CalendarDays className="h-5 w-5" />}
            </div>

            <span className={cn('block text-[13px] font-bold leading-tight', isSelected ? 'text-brand-900' : 'text-slate-900')}>
              {r.label}
            </span>
            <span className="mt-1 block text-[10px] text-slate-500 font-medium">{r.tagline}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ── 4. Requirement Specific Trip Details ───────────────────────────────── */

export function RoutePlanner({ config, setConfig, isInterCity }) {
  const isTwoWay = config.tripType === 'two_way'
  const stops = isInterCity ? (config.interCityDetails?.stops || []) : (config.stops || [])
  const returnStops = isInterCity ? (config.interCityDetails?.returnStops || []) : (config.returnStops || [])
  const pickupId = isInterCity ? (config.interCityDetails?.startLocationId || 'start_hitec') : (config.pickupId || 'start_hitec')
  const dropId = isInterCity ? (config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada') : (config.dropId || 'gachibowli')
  
  // Return drop ID: defaults to Outbound pickup ID if not set or set to 'same_as_pickup'
  const rawReturnDropId = isInterCity ? config.interCityDetails?.returnDropId : config.returnDropId
  const returnDropId = (rawReturnDropId && rawReturnDropId !== 'same_as_pickup') ? rawReturnDropId : pickupId

  const updateState = (patch) => {
    setConfig((c) => {
      if (isInterCity) {
        let legacyPatch = {}
        if (patch.destinationId) legacyPatch.interCityDestination = patch.destinationId
        return { ...c, interCityDetails: { ...c.interCityDetails, ...patch }, ...legacyPatch }
      }
      return { ...c, ...patch }
    })
  }

  const setTripType = (type) => setConfig((c) => ({ ...c, tripType: type }))

  const handlePickupChange = (newPickupId) => {
    if (isInterCity) {
      const currentReturnDrop = config.interCityDetails?.returnDropId
      const shouldSyncReturn = !currentReturnDrop || currentReturnDrop === 'same_as_pickup' || currentReturnDrop === pickupId
      updateState({
        startLocationId: newPickupId,
        ...(shouldSyncReturn ? { returnDropId: newPickupId } : {})
      })
    } else {
      const currentReturnDrop = config.returnDropId
      const shouldSyncReturn = !currentReturnDrop || currentReturnDrop === 'same_as_pickup' || currentReturnDrop === pickupId
      updateState({
        pickupId: newPickupId,
        ...(shouldSyncReturn ? { returnDropId: newPickupId } : {})
      })
    }
  }

  const addStop = () => updateState({ stops: [...stops, { id: Math.random().toString(36).slice(2), locationId: '' }] })
  const removeStop = (id) => updateState({ stops: stops.filter((s) => s.id !== id) })
  const updateStop = (id, locationId) => updateState({ stops: stops.map((s) => (s.id === id ? { ...s, locationId } : s)) })

  const addReturnStop = () => updateState({ returnStops: [...returnStops, { id: Math.random().toString(36).slice(2), locationId: '' }] })
  const removeReturnStop = (id) => updateState({ returnStops: returnStops.filter((s) => s.id !== id) })
  const updateReturnStop = (id, locationId) => updateState({ returnStops: returnStops.map((s) => (s.id === id ? { ...s, locationId } : s)) })

  const canAddStop = stops.length < 3 && (stops.length === 0 || stops.every((s) => s.locationId !== ''))
  const canAddReturnStop = returnStops.length < 3 && (returnStops.length === 0 || returnStops.every((s) => s.locationId !== ''))

  const locations = isInterCity ? INTERCITY_DESTINATIONS : CITY_LOCATIONS
  const pickupLocations = CITY_LOCATIONS

  const outboundDestObj = isInterCity 
    ? INTERCITY_DESTINATIONS.find((d) => d.id === dropId)
    : CITY_LOCATIONS.find((d) => d.id === dropId)
  const outboundDestName = outboundDestObj?.name || (isInterCity ? 'Destination City' : 'Destination')

  // Live telemetry calculations
  const outboundTelemetry = getRouteLegTelemetry(pickupId, stops, dropId, isInterCity)
  const returnTelemetry = isTwoWay ? getRouteLegTelemetry(dropId, returnStops, returnDropId, isInterCity) : null

  const totalDistanceKm = outboundTelemetry.distanceKm + (returnTelemetry?.distanceKm || 0)
  const totalDurationMinutes = outboundTelemetry.durationMinutes + (returnTelemetry?.durationMinutes || 0)
  
  let formattedTotalDuration = ''
  const totHours = Math.floor(totalDurationMinutes / 60)
  const totMins = totalDurationMinutes % 60
  if (totHours > 0 && totMins > 0) {
    formattedTotalDuration = `${totHours} hr${totHours > 1 ? 's' : ''} ${totMins} min${totMins > 1 ? 's' : ''}`
  } else if (totHours > 0) {
    formattedTotalDuration = `${totHours} hr${totHours > 1 ? 's' : ''}`
  } else {
    formattedTotalDuration = `${totMins} mins`
  }

  return (
    <div className="space-y-4">
      {/* Direction Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Trip Direction</span>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTripType('one_way')}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-bold transition-all',
              !isTwoWay ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            One Way
          </button>
          <button
            type="button"
            onClick={() => setTripType('two_way')}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-bold transition-all',
              isTwoWay ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            Round Trip (Two Way)
          </button>
        </div>
      </div>

      {/* ── CARD 1: OUTBOUND LEG ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm relative space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            {isTwoWay ? 'Leg 1: Outbound Journey' : 'Journey Route'}
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            {stops.length > 0 ? `${stops.length} intermediate stop${stops.length > 1 ? 's' : ''}` : 'Direct'}
          </span>
        </div>

        {/* Timeline connector visual */}
        <div className="absolute left-[31.5px] top-[54px] bottom-[85px] w-[2px] bg-slate-100 z-0" />

        {/* 1. Pickup Location */}
        <div className="relative z-10 flex items-start gap-3">
          <div className="mt-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-white">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Pickup Location (From)
            </label>
            <div className="relative">
              <select
                value={pickupId}
                onChange={(e) => handlePickupChange(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-sm font-semibold text-slate-900 focus:border-brand-400 focus:outline-none"
              >
                {pickupLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Outbound Stops */}
        {stops.map((stop, i) => (
          <div key={stop.id} className="relative z-10 flex items-start gap-3">
            <div className="mt-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <select
                  value={stop.locationId}
                  onChange={(e) => updateStop(stop.id, e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-sm font-semibold text-slate-900 focus:border-brand-400 focus:outline-none"
                >
                  <option value="" disabled>Select stop {i + 1}...</option>
                  {pickupLocations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <button
                type="button"
                onClick={() => removeStop(stop.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                title="Remove stop"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
          </div>
        ))}

        {/* Add Outbound Stop Button */}
        <div className="relative z-10 ml-[28px] flex items-center gap-2">
          <button
            type="button"
            disabled={!canAddStop}
            onClick={addStop}
            className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop {stops.length > 0 ? `(${stops.length}/3)` : ''}
          </button>
          {!canAddStop && stops.length > 0 && stops.length < 3 && (
            <span className="text-[10px] text-amber-600 font-medium">Select location above first</span>
          )}
        </div>

        {/* Outbound Destination */}
        <div className="relative z-10 flex items-start gap-3">
          <div className="mt-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-900 ring-4 ring-white">
            <div className="h-1.5 w-1.5 rounded-full bg-white" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {isTwoWay ? 'Outbound Destination (Turnaround)' : 'Destination Location (To)'}
            </label>
            <div className="relative">
              <select
                value={dropId}
                onChange={(e) => updateState(isInterCity ? { destinationId: e.target.value } : { dropId: e.target.value })}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-sm font-semibold text-slate-900 focus:border-brand-400 focus:outline-none"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} {l.distanceKm ? `(~${l.distanceKm}km)` : ''}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Outbound Leg Telemetry Footer */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 mt-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Navigation className="h-3.5 w-3.5 text-emerald-600 rotate-45" />
              ~{outboundTelemetry.distanceKm} km
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Clock className="h-3.5 w-3.5 text-brand-600" />
              ~{outboundTelemetry.formattedDuration}
            </span>
          </div>
          <span className="rounded-md bg-emerald-100/70 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
            {outboundTelemetry.tag}
          </span>
        </div>
      </div>

      {/* ── CARD 2: RETURN LEG (Only in Round Trip) ── */}
      {isTwoWay && (
        <div className="rounded-2xl border border-brand-200/80 bg-brand-50/20 p-4 shadow-sm relative space-y-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between border-b border-brand-100/80 pb-2.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-brand-700 flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-brand-500" />
              Leg 2: Return Journey
            </span>
            <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200/60">
              Starts from {outboundDestName}
            </span>
          </div>

          {/* Timeline connector visual */}
          <div className="absolute left-[31.5px] top-[54px] bottom-[85px] w-[2px] bg-brand-100 z-0" />

          {/* 1. Return Origin (Locked/Auto-synced to Outbound Destination) */}
          <div className="relative z-10 flex items-start gap-3">
            <div className="mt-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
              <span className="text-[9px] leading-none text-slate-600 font-bold">↩</span>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Return Origin (From)
              </label>
              <div className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm font-semibold text-slate-700 flex items-center justify-between">
                <span className="truncate">{outboundDestName}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded">Auto</span>
              </div>
            </div>
          </div>

          {/* Return Stops */}
          {returnStops.map((stop, i) => (
            <div key={stop.id} className="relative z-10 flex items-start gap-3">
              <div className="mt-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 ring-4 ring-white">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              </div>
              <div className="flex-1 flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={stop.locationId}
                    onChange={(e) => updateReturnStop(stop.id, e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-sm font-semibold text-slate-900 focus:border-brand-400 focus:outline-none"
                  >
                    <option value="" disabled>Select return stop {i + 1}...</option>
                    {pickupLocations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <button
                  type="button"
                  onClick={() => removeReturnStop(stop.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                  title="Remove stop"
                >
                  <span className="text-lg leading-none">×</span>
                </button>
              </div>
            </div>
          ))}

          {/* Add Return Stop Button */}
          <div className="relative z-10 ml-[28px] flex items-center gap-2">
            <button
              type="button"
              disabled={!canAddReturnStop}
              onClick={addReturnStop}
              className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Return Stop {returnStops.length > 0 ? `(${returnStops.length}/3)` : ''}
            </button>
            {!canAddReturnStop && returnStops.length > 0 && returnStops.length < 3 && (
              <span className="text-[10px] text-amber-600 font-medium">Select location above first</span>
            )}
          </div>

          {/* Return Destination Dropdown (Defaults to Pickup Location) */}
          <div className="relative z-10 flex items-start gap-3">
            <div className="mt-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-600 ring-4 ring-white">
              <Check className="h-2.5 w-2.5 text-white" />
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wide text-brand-700">
                  Final Return Destination (To)
                </label>
                {returnDropId === pickupId && (
                  <span className="text-[10px] font-semibold text-brand-600">
                    Matches Pickup
                  </span>
                )}
              </div>
              <div className="relative">
                <select
                  value={returnDropId}
                  onChange={(e) => updateState(isInterCity ? { returnDropId: e.target.value } : { returnDropId: e.target.value })}
                  className="w-full appearance-none rounded-xl border border-brand-300 bg-white pl-3 pr-8 py-2 text-sm font-semibold text-brand-950 focus:border-brand-500 focus:outline-none"
                >
                  {pickupLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.id === pickupId ? '(Initial Pickup)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              </div>
            </div>
          </div>

          {/* Return Leg Telemetry Footer */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-brand-200/80 px-3.5 py-2.5 mt-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-bold text-brand-950">
                <Navigation className="h-3.5 w-3.5 text-brand-600 rotate-45" />
                ~{returnTelemetry.distanceKm} km
              </span>
              <span className="text-brand-200">|</span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-brand-950">
                <Clock className="h-3.5 w-3.5 text-brand-600" />
                ~{returnTelemetry.formattedDuration}
              </span>
            </div>
            <span className="rounded-md bg-brand-100/70 px-2 py-0.5 text-[10px] font-bold text-brand-800 uppercase tracking-wide">
              {returnTelemetry.tag}
            </span>
          </div>
        </div>
      )}

      {/* ── OVERALL ROUND TRIP SUMMARY BANNER ── */}
      {isTwoWay && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-slate-900 to-brand-950 px-4 py-3 text-white shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white">
              <Compass className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Total Round Trip Route</p>
              <p className="text-xs font-semibold text-white">
                Outbound + Return {stops.length + returnStops.length > 0 ? `(${stops.length + returnStops.length} stops total)` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-black text-emerald-300">
              ~{totalDistanceKm} km
            </span>
            <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-black text-white">
              ~{formattedTotalDuration} drive
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function TripDetailsForm({ config, setConfig }) {
  const req = config.requirement
  const minDur = getMinDurationForConfig(config)

  const setDurationHours = (durationHours) => setConfig((c) => ({ ...c, durationHours }))
  const setAirportTerminal = (terminalId) =>
    setConfig((c) => ({ ...c, airportDetails: { ...c.airportDetails, terminalId } }))
  const setAirportFlow = (flow) => setConfig((c) => ({ ...c, airportDetails: { ...c.airportDetails, flow } }))
  const setFlightNumber = (flightNumber) =>
    setConfig((c) => ({ ...c, airportDetails: { ...c.airportDetails, flightNumber } }))
  const setFullTimeLocality = (locality) =>
    setConfig((c) => ({ ...c, fullTimeDetails: { ...c.fullTimeDetails, locality } }))
  const setFullTimeUnit = (durationUnit) =>
    setConfig((c) => ({ ...c, fullTimeDetails: { ...c.fullTimeDetails, durationUnit } }))
  const setFullTimeCount = (durationCount) =>
    setConfig((c) => ({ ...c, fullTimeDetails: { ...c.fullTimeDetails, durationCount: Math.max(1, durationCount) } }))

  // Auto-clamp duration if it falls below the minimum required travel time
  useEffect(() => {
    if (req === 'within_city') {
      if (config.durationHours < minDur.minHours) {
        setConfig((c) => ({ ...c, durationHours: minDur.minHours }))
      }
    } else if (req === 'inter_city') {
      const curDays = config.interCityDetails?.days ?? 1
      const curHours = config.interCityDetails?.hours ?? 0
      const curTotalHours = (curDays * 24) + curHours

      if (curTotalHours < minDur.minHours) {
        if (minDur.minHours >= 24) {
          const reqDays = Math.ceil(minDur.minHours / 24)
          setConfig((c) => ({
            ...c,
            interCityDays: reqDays,
            interCityDetails: {
              ...c.interCityDetails,
              days: reqDays,
              hours: 0,
            },
          }))
        } else {
          if (curDays === 0) {
            setConfig((c) => ({
              ...c,
              interCityDetails: {
                ...c.interCityDetails,
                hours: minDur.minHours,
              },
            }))
          }
        }
      }
    }
  }, [
    req,
    minDur.minHours,
    config.pickupId,
    config.dropId,
    config.stops,
    config.returnStops,
    config.returnDropId,
    config.tripType,
    config.interCityDetails?.destinationId,
    config.interCityDestination,
    config.interCityDetails?.stops,
    config.interCityDetails?.returnStops,
  ])

  return (
    <div className="space-y-4">
      {/* ── CASE 1: WITHIN CITY ── */}
      {req === 'within_city' && (
        <div className="space-y-3.5">
          <RoutePlanner config={config} setConfig={setConfig} isInterCity={false} />

          {/* Duration Presets + Custom Counter */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-brand-600" />
                Estimated Duration
              </label>
              <span className="text-xs font-black text-brand-600">{config.durationHours} Hours</span>
            </div>

            {minDur.minHours > 1 && (
              <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200/80 px-3 py-2 text-xs font-semibold text-amber-800">
                <Info className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{minDur.label}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="grid flex-1 grid-cols-4 gap-2">
                {[1, 2, 4, 8].map((h) => {
                  const isBelowMin = h < minDur.minHours
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={isBelowMin}
                      onClick={() => setDurationHours(h)}
                      className={cn(
                        'rounded-xl border py-2 text-center text-xs font-bold transition-all',
                        config.durationHours === h
                          ? 'border-brand-500 bg-brand-50 text-brand-600 ring-1 ring-brand-500'
                          : isBelowMin
                            ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-50'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      {h} {h === 1 ? 'hr' : 'hrs'}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  disabled={config.durationHours <= minDur.minHours}
                  onClick={() => setDurationHours(Math.max(minDur.minHours, config.durationHours - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-3.5 w-3.5 text-slate-600" />
                </button>
                <span className="w-8 text-center text-xs font-black text-slate-900">{config.durationHours}h</span>
                <button
                  type="button"
                  onClick={() => setDurationHours(Math.min(24, config.durationHours + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CASE 2: INTER CITY ── */}
      {req === 'inter_city' && (
        <div className="space-y-3.5">
          <RoutePlanner config={config} setConfig={setConfig} isInterCity={true} />

          {/* Outstation Duration: Days + Hours combined */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-brand-600" />
                Trip Duration (Days + Hours)
              </label>
              <span className="text-xs font-bold text-slate-500">Customizable</span>
            </div>

            {/* Minimum Travel Requirement Notification */}
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200/80 px-3.5 py-2 text-xs text-blue-900">
              <Info className="h-4 w-4 shrink-0 text-blue-600" />
              <span><strong>Travel Requirement:</strong> {minDur.label}</span>
            </div>

            {/* 1. Days Row */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Days:</span>
                <span className="text-xs font-bold text-brand-600">
                  {config.interCityDetails?.days ?? 1} {(config.interCityDetails?.days ?? 1) === 1 ? 'Day' : 'Days'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((d) => {
                    const isBelowMin = (d * 24 + (config.interCityDetails?.hours ?? 0)) < minDur.minHours
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={isBelowMin}
                        onClick={() =>
                          setConfig((c) => ({
                            ...c,
                            interCityDays: d,
                            interCityDetails: { ...c.interCityDetails, days: d },
                          }))
                        }
                        className={cn(
                          'rounded-xl border py-2 text-center text-xs font-bold transition-all',
                          (config.interCityDetails?.days ?? 1) === d
                            ? 'border-brand-500 bg-brand-50 text-brand-600 ring-1 ring-brand-500'
                            : isBelowMin
                              ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-50'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {d} {d === 1 ? 'Day' : 'Days'}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    disabled={
                      (config.interCityDetails?.days ?? 1) <= 0 ||
                      (((config.interCityDetails?.days ?? 1) - 1) * 24 + (config.interCityDetails?.hours ?? 0)) < minDur.minHours
                    }
                    onClick={() =>
                      setConfig((c) => {
                        const curD = c.interCityDetails?.days ?? 1
                        const curH = c.interCityDetails?.hours ?? 0
                        if ((curD - 1) * 24 + curH < minDur.minHours) return c
                        const nextDays = Math.max(0, curD - 1)
                        return {
                          ...c,
                          interCityDays: nextDays,
                          interCityDetails: { ...c.interCityDetails, days: nextDays },
                        }
                      })
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Minus className="h-3.5 w-3.5 text-slate-600" />
                  </button>
                  <span className="w-8 text-center text-xs font-black text-slate-900">
                    {config.interCityDetails?.days ?? 1}d
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((c) => {
                        const nextDays = Math.min(30, (c.interCityDetails?.days ?? 1) + 1)
                        return {
                          ...c,
                          interCityDays: nextDays,
                          interCityDetails: { ...c.interCityDetails, days: nextDays },
                        }
                      })
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white"
                  >
                    <Plus className="h-3.5 w-3.5 text-slate-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Extra Hours Row */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">+ Extra Hours:</span>
                <span className="text-xs font-bold text-brand-600">
                  {config.interCityDetails?.hours ?? 0} {(config.interCityDetails?.hours ?? 0) === 1 ? 'Hour' : 'Hours'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-5 gap-1.5">
                  {[0, 4, 6, 8, 12].map((h) => {
                    const isBelowMin = ((config.interCityDetails?.days ?? 1) * 24 + h) < minDur.minHours
                    return (
                      <button
                        key={h}
                        type="button"
                        disabled={isBelowMin}
                        onClick={() =>
                          setConfig((c) => ({
                            ...c,
                            interCityDetails: { ...c.interCityDetails, hours: h },
                          }))
                        }
                        className={cn(
                          'rounded-xl border py-2 text-center text-xs font-bold transition-all',
                          (config.interCityDetails?.hours ?? 0) === h
                            ? 'border-brand-500 bg-brand-50 text-brand-600 ring-1 ring-brand-500'
                            : isBelowMin
                              ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-50'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {h} hrs
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    disabled={
                      (config.interCityDetails?.hours ?? 0) <= 0 ||
                      ((config.interCityDetails?.days ?? 1) * 24 + ((config.interCityDetails?.hours ?? 0) - 1)) < minDur.minHours
                    }
                    onClick={() =>
                      setConfig((c) => {
                        const curD = c.interCityDetails?.days ?? 1
                        const curH = c.interCityDetails?.hours ?? 0
                        if (curD * 24 + (curH - 1) < minDur.minHours) return c
                        const nextHours = Math.max(0, curH - 1)
                        return {
                          ...c,
                          interCityDetails: { ...c.interCityDetails, hours: nextHours },
                        }
                      })
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Minus className="h-3.5 w-3.5 text-slate-600" />
                  </button>
                  <span className="w-8 text-center text-xs font-black text-slate-900">
                    {config.interCityDetails?.hours ?? 0}h
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((c) => {
                        const nextHours = Math.min(23, (c.interCityDetails?.hours ?? 0) + 1)
                        return {
                          ...c,
                          interCityDetails: { ...c.interCityDetails, hours: nextHours },
                        }
                      })
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white"
                  >
                    <Plus className="h-3.5 w-3.5 text-slate-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Total Duration Highlight Banner */}
            <div className="flex items-center justify-between rounded-xl bg-brand-50 border border-brand-200/80 px-4 py-3">
              <span className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-brand-600" /> Total Duration:
              </span>
              <span className="text-sm font-black text-brand-700">
                {(config.interCityDetails?.days ?? 1) > 0 && (config.interCityDetails?.hours ?? 0) > 0
                  ? `${config.interCityDetails?.days ?? 1} Day${(config.interCityDetails?.days ?? 1) > 1 ? 's' : ''} ${config.interCityDetails?.hours ?? 0} Hour${(config.interCityDetails?.hours ?? 0) > 1 ? 's' : ''} (${(config.interCityDetails?.days ?? 1) * 24 + (config.interCityDetails?.hours ?? 0)} Hours total)`
                  : (config.interCityDetails?.days ?? 1) > 0
                  ? `${config.interCityDetails?.days ?? 1} Day${(config.interCityDetails?.days ?? 1) > 1 ? 's' : ''} (${(config.interCityDetails?.days ?? 1) * 24} Hours)`
                  : `${config.interCityDetails?.hours ?? 4} Hours`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── CASE 3: AIRPORT ── */}
      {req === 'airport' && (
        <div className="space-y-3.5">
          {/* Arrivals vs Departures + One-way/Two-way */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAirportFlow('departure')}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-bold transition-all',
                  config.airportDetails.flow === 'departure'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                🛫 To Airport (Departure)
              </button>
              <button
                type="button"
                onClick={() => setAirportFlow('arrival')}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-bold transition-all',
                  config.airportDetails.flow === 'arrival'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                🛬 From Airport (Arrival)
              </button>
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTripType('one_way')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-bold transition-all',
                  config.tripType === 'one_way' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
                )}
              >
                One Way
              </button>
              <button
                type="button"
                onClick={() => setTripType('two_way')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-bold transition-all',
                  config.tripType === 'two_way' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
                )}
              >
                Round Trip
              </button>
            </div>
          </div>

          {/* Locations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PickupField />
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Airport Terminal
              </label>
              <div className="relative">
                <select
                  value={config.airportDetails.terminalId}
                  onChange={(e) => setAirportTerminal(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-400 focus:outline-none"
                >
                  {AIRPORT_LOCATIONS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Flight Number Input (Optional) */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              Flight Number <span className="font-normal text-slate-400">(Optional - for automated flight tracking)</span>
            </label>
            <div className="relative">
              <Plane className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. 6E-2415 / AI-840"
                value={config.airportDetails.flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 py-3 text-sm font-semibold uppercase text-slate-900 placeholder:normal-case placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── CASE 4: FULL TIME ── */}
      {req === 'full_time' && (
        <div className="space-y-4">
          {/* Operational Locality */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Primary Locality / Operational Area</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={config.fullTimeDetails.locality}
                onChange={(e) => setFullTimeLocality(e.target.value)}
                placeholder="e.g. HITEC City, Jubilee Hills, Gachibowli"
                className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 py-3 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Duration Selector (Days / Weeks / Months) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Contract Duration</label>
              <div className="flex rounded-xl bg-slate-200/80 p-1">
                {['days', 'weeks', 'months'].map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setFullTimeUnit(unit)}
                    className={cn(
                      'rounded-lg px-3 py-1 text-xs font-bold capitalize transition-all',
                      config.fullTimeDetails.durationUnit === unit
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900',
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white p-3 border border-slate-200">
              <span className="text-sm font-bold text-slate-800">
                Number of {config.fullTimeDetails.durationUnit}:
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFullTimeCount(config.fullTimeDetails.durationCount - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100"
                >
                  <Minus className="h-4 w-4 text-slate-700" />
                </button>
                <span className="w-8 text-center text-base font-black text-slate-900">
                  {config.fullTimeDetails.durationCount}
                </span>
                <button
                  type="button"
                  onClick={() => setFullTimeCount(config.fullTimeDetails.durationCount + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100"
                >
                  <Plus className="h-4 w-4 text-slate-700" />
                </button>
              </div>
            </div>

            {/* Standard 12h policy notice */}
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50/80 border border-amber-200 p-3 text-xs text-amber-900">
              <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <span className="font-bold">12 Hours / Day Regular Baseline:</span> Full-time drivers are assigned for
                up to 12 working hours daily. Any additional duty hour is billed transparently at{' '}
                <span className="font-bold">₹150 / hour</span> overtime.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 5. Smart Driver Skill Picker ───────────────────────────────────────── */

export function SmartDriverPicker({ config, onChange, skills = SKILLS }) {
  const recommendedId = getRecommendedSkillId(config.carDetails, config.requirement)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Driver Certification & Tier
        </label>
        <span className="flex items-center gap-1 text-[11px] font-bold text-brand-600">
          <Sparkles className="h-3 w-3" /> Auto-matched for your vehicle
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {skills.map((s) => {
          const isSelected = s.id === config.skillId
          const isRecommended = s.id === recommendedId

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={cn(
                'relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all',
                isSelected
                  ? 'border-brand-500 bg-brand-50/70 shadow-sm ring-2 ring-brand-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {isRecommended && (
                <span className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                  <Sparkles className="h-2.5 w-2.5" /> Recommended
                </span>
              )}

              <div className="flex w-full items-center justify-between">
                <span className={cn('text-base font-black', isSelected ? 'text-brand-900' : 'text-slate-900')}>
                  {s.label}
                </span>
                <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                  ₹{s.rate}/km
                </span>
              </div>

              <span className="mt-0.5 text-xs font-semibold text-brand-600">{s.tagline}</span>
              <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{s.description}</p>

              <div className="mt-3 flex w-full items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-400">
                <span>ETA: {s.eta}</span>
                {isSelected ? (
                  <span className="flex items-center gap-1 font-bold text-brand-600">
                    <Check className="h-3.5 w-3.5" /> Selected
                  </span>
                ) : (
                  <span className="text-slate-400 hover:text-slate-600">Click to choose</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── 6. Safety & Field Controls ─────────────────────────────────────────── */

export function DropPicker({ value, onChange, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const drop = DROPS.find((d) => d.id === value) ?? DROPS[0]

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 text-left transition-colors hover:border-slate-300 focus:border-brand-400 focus:bg-white focus:outline-none',
          size === 'lg' ? 'px-4 py-4' : 'px-4 py-3.5',
        )}
      >
        <Navigation className="h-4 w-4 shrink-0 rotate-90 text-brand-500" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Drop</span>
          <span className={cn('block truncate text-sm font-semibold', drop ? 'text-slate-900' : 'text-slate-400')}>
            {drop ? `${drop.name} · ${drop.address}` : 'Where are you heading?'}
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="rise-in absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        >
          {DROPS.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                role="option"
                aria-selected={place.id === value}
                onClick={() => {
                  onChange(place.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <MapPin className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{place.name}</span>
                  <span className="block truncate text-xs text-slate-500">{place.address}</span>
                </span>
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {place.distanceKm} km
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PickupField({ size = 'md' }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50',
        size === 'lg' ? 'px-4 py-4' : 'px-4 py-3.5',
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full border-[3px] border-brand-500" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Pickup</span>
        <span className="block truncate text-sm font-semibold text-slate-900">{PICKUP.address}</span>
      </span>
    </div>
  )
}

export function TimePicker({ value, onChange, size = 'md' }) {
  return (
    <div className="relative">
      <Clock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-10 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-300 focus:border-brand-400 focus:bg-white focus:outline-none',
          size === 'lg' ? 'py-4' : 'py-3.5',
        )}
      >
        {PICKUP_TIMES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}

export function CeilingSlider({ value, onChange }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Gauge className="h-3.5 w-3.5" /> Speed ceiling
        </span>
        <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-600">{value} km/h</span>
      </div>
      <input
        type="range"
        min="40"
        max="120"
        step="5"
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), 40, 120))}
        className="w-full accent-brand-500"
      />
      <p className="mt-1.5 text-xs text-slate-500">
        Breaches alert you, your guardians and the Safety Desk instantly.
      </p>
    </div>
  )
}

export function VisionPicker({ value, onChange }) {
  const active = VISION_MODES.find((m) => m.id === value)
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {VISION_MODES.map((mode) => {
          const selected = mode.id === value
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange(mode.id)}
              className={cn(
                'relative rounded-2xl border p-3 text-center transition-colors',
                selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              {selected && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-brand-500" />}
              <span className={cn('block text-sm font-black', selected ? 'text-brand-600' : 'text-slate-900')}>
                Mode {mode.id}
              </span>
              <span className="block text-[10px] font-semibold text-slate-500">{mode.name}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{active?.desc} · sealed into Trip Vault</p>
    </div>
  )
}

export function PackagePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {HOUR_PACKAGES.map((pkg) => {
        const selected = pkg.id === value
        return (
          <button
            key={pkg.id}
            type="button"
            onClick={() => onChange(pkg.id)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition-all',
              selected
                ? 'border-brand-500 bg-brand-50 shadow-sm ring-1 ring-brand-500'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            <span className={cn('block text-sm font-bold', selected ? 'text-brand-900' : 'text-slate-900')}>
              {pkg.label}
            </span>
            <span className="block text-[10px] font-semibold text-slate-500">
              {pkg.includedKm} km included
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function SkillPicker({ value, onChange }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-300 focus:border-brand-400 focus:outline-none"
      >
        {SKILLS.map((skill) => (
          <option key={skill.id} value={skill.id}>
            {skill.label} (₹{skill.rate}/km)
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}

