import { CalendarDays, Car, Compass, Gauge, MapPin, Navigation, Plane, Search, Sparkles, Check, Clock } from 'lucide-react'
import { AIRPORT_LOCATIONS, INTERCITY_DESTINATIONS, PICKUP, REQUIREMENTS, SKILLS, START_LOCATIONS, VISION_MODES, CITY_LOCATIONS } from '../../../data/mock.js'
import { dropFor, getRouteLegTelemetry } from '../../../lib/booking.js'
import { cn, formatINR } from '../../../lib/utils.js'

/**
 * Read-only rendering of the mobile app's booking screen, driven by the same
 * config object as the web form so the preview always matches what is on the
 * left. Interaction lives on the web form; this mirrors it.
 */
export default function MobileBookScreen({ config, quote, visionMode }) {
  const drop = dropFor(config.dropId)
  const activeReq = REQUIREMENTS.find((r) => r.id === config.requirement) ?? REQUIREMENTS[0]

  let pickupLabel = PICKUP.address
  let destinationLabel = 'Where are you heading?'

  if (config.requirement === 'within_city') {
    destinationLabel = drop ? `${drop.name} (${config.tripType === 'two_way' ? 'Round-trip' : 'One-way'})` : 'Select drop location'
  } else if (config.requirement === 'inter_city') {
    const startLoc = START_LOCATIONS.find((s) => s.id === (config.interCityDetails?.startLocationId || 'start_hitec'))
    pickupLabel = startLoc?.name ?? PICKUP.address
    const dest = INTERCITY_DESTINATIONS.find((d) => d.id === (config.interCityDetails?.destinationId || config.interCityDestination))
    const d = config.interCityDetails?.days ?? 1
    const h = config.interCityDetails?.hours ?? 0
    const dur = d > 0 && h > 0 ? `${d}d ${h}h (${d * 24 + h}h)` : d > 0 ? `${d}d (${d * 24}h)` : `${h}h`
    destinationLabel = `${dest?.name ?? 'Outstation'} · ${dur} (${config.tripType === 'two_way' ? 'Round-trip' : 'One-way'})`
  } else if (config.requirement === 'airport') {
    const port = AIRPORT_LOCATIONS.find((a) => a.id === config.airportDetails?.terminalId)
    destinationLabel = `${port?.name ?? 'Airport Terminal'} (${config.airportDetails?.flow === 'arrival' ? 'Arrival' : 'Departure'})`
  } else if (config.requirement === 'full_time') {
    destinationLabel = `${config.fullTimeDetails?.locality} · ${config.fullTimeDetails?.durationCount} ${config.fullTimeDetails?.durationUnit}`
  }

  const isInterCity = config.requirement === 'inter_city'
  const isTwoWay = config.tripType === 'two_way'
  const pickupId = isInterCity ? (config.interCityDetails?.startLocationId || 'start_hitec') : (config.pickupId || 'start_hitec')
  const dropId = isInterCity ? (config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada') : (config.dropId || 'gachibowli')
  const returnDropId = isInterCity ? (config.interCityDetails?.returnDropId || 'same_as_pickup') : (config.returnDropId || 'same_as_pickup')
  const stops = isInterCity ? (config.interCityDetails?.stops || []) : (config.stops || [])
  const returnStops = isInterCity ? (config.interCityDetails?.returnStops || []) : (config.returnStops || [])

  const outboundTelem = getRouteLegTelemetry(pickupId, stops, dropId, isInterCity)
  const returnTelem = isTwoWay ? getRouteLegTelemetry(dropId, returnStops, returnDropId, isInterCity) : null

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex shrink-0 items-center justify-between px-5 pb-3 pt-2 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-black text-brand-600">
            PS
          </span>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-500">MyDriver App</p>
            <p className="truncate text-xs font-bold text-slate-900">Priya Sharma</p>
          </div>
        </div>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600 border border-brand-200 capitalize">
          {config.vehicleType}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 no-scrollbar">
        {/* Vehicle Badge */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 border border-slate-200/80">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Car className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-slate-900">
              {config.carDetails.company} {config.carDetails.model}
            </span>
            <span className="block text-[10px] text-slate-500">
              {config.carDetails.transmission} · {config.carDetails.engineType}
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
            {activeReq.label}
          </span>
        </div>

        {/* Route Card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-3 relative overflow-hidden">
          {(config.requirement === 'within_city' || config.requirement === 'inter_city') ? (
            <div className="flex flex-col gap-0 relative">
              {/* Outbound Leg Header */}
              {config.tripType === 'two_way' && (
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Leg 1: Outbound</span>
                </div>
              )}
              
              <div className="relative">
                <div className="absolute left-[7px] top-[14px] bottom-[14px] w-[2px] bg-slate-100 z-0" />
                
                {/* Pickup */}
                <div className="relative z-10 flex items-start gap-2.5 py-1 bg-white">
                  <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-white">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Pickup</p>
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {CITY_LOCATIONS.find(l => l.id === (config.requirement === 'inter_city' ? (config.interCityDetails?.startLocationId || 'start_hitec') : (config.pickupId || 'start_hitec')))?.name || 'Pickup'}
                    </p>
                  </div>
                </div>

                {/* Stops */}
                {((config.requirement === 'inter_city' ? config.interCityDetails?.stops : config.stops) || []).map((stop, i) => {
                  const loc = CITY_LOCATIONS.find(l => l.id === stop.locationId)
                  if (!loc) return null
                  return (
                    <div key={stop.id} className="relative z-10 flex items-start gap-2.5 py-1 bg-white">
                      <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Stop {i + 1}</p>
                        <p className="truncate text-xs font-semibold text-slate-900">{loc.name}</p>
                      </div>
                    </div>
                  )
                })}

                {/* Destination */}
                <div className="relative z-10 flex items-start gap-2.5 py-1 bg-white">
                  <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-900 ring-4 ring-white">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      {config.tripType === 'two_way' ? 'Turnaround Point' : 'Destination'}
                    </p>
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {config.requirement === 'inter_city'
                        ? INTERCITY_DESTINATIONS.find(l => l.id === (config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada'))?.name
                        : CITY_LOCATIONS.find(l => l.id === (config.dropId || 'gachibowli'))?.name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Return Trip Section */}
              {config.tripType === 'two_way' && (
                <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-brand-700">Leg 2: Return</span>
                    <span className="text-[8px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                      From {config.requirement === 'inter_city'
                        ? INTERCITY_DESTINATIONS.find(l => l.id === (config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada'))?.name
                        : CITY_LOCATIONS.find(l => l.id === (config.dropId || 'gachibowli'))?.name}
                    </span>
                  </div>

                  <div className="relative">
                    <div className="absolute left-[7px] top-[14px] bottom-[14px] w-[2px] bg-brand-100 z-0" />

                    {/* Return Origin (Auto) */}
                    <div className="relative z-10 flex items-start gap-2.5 py-1 bg-white">
                      <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
                        <span className="text-[8px] leading-none text-slate-600 font-bold">↩</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Return Origin</p>
                        <p className="truncate text-xs font-semibold text-slate-700">
                          {config.requirement === 'inter_city'
                            ? INTERCITY_DESTINATIONS.find(l => l.id === (config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada'))?.name
                            : CITY_LOCATIONS.find(l => l.id === (config.dropId || 'gachibowli'))?.name}
                        </p>
                      </div>
                    </div>

                    {/* Return Stops */}
                    {((config.requirement === 'inter_city' ? config.interCityDetails?.returnStops : config.returnStops) || []).map((stop, i) => {
                      const loc = CITY_LOCATIONS.find(l => l.id === stop.locationId)
                      if (!loc) return null
                      return (
                        <div key={stop.id} className="relative z-10 flex items-start gap-2.5 py-1 bg-white">
                          <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 ring-4 ring-white">
                            <div className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Return Stop {i + 1}</p>
                            <p className="truncate text-xs font-semibold text-slate-900">{loc.name}</p>
                          </div>
                        </div>
                      )
                    })}

                    {/* Final Drop */}
                    <div className="relative z-10 flex items-start gap-2.5 py-1 bg-white">
                      <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-600 ring-4 ring-white">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-brand-600">Final Return Drop</p>
                        <p className="truncate text-xs font-semibold text-brand-700">
                          {(() => {
                            const rawId = config.requirement === 'inter_city' ? config.interCityDetails?.returnDropId : config.returnDropId
                            const pickup = config.requirement === 'inter_city' ? (config.interCityDetails?.startLocationId || 'start_hitec') : (config.pickupId || 'start_hitec')
                            const dropFinalId = (!rawId || rawId === 'same_as_pickup') ? pickup : rawId
                            return CITY_LOCATIONS.find(l => l.id === dropFinalId)?.name || 'Pickup'
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Telemetry Summary Footer */}
              <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-50 p-2 border border-slate-200/80 text-[10px]">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Navigation className="h-3 w-3 text-emerald-600 rotate-45" />
                  <span>~{isTwoWay ? outboundTelem.distanceKm + (returnTelem?.distanceKm || 0) : outboundTelem.distanceKm} km</span>
                </div>
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Clock className="h-3 w-3 text-brand-600" />
                  <span>~{isTwoWay ? (Math.round((outboundTelem.durationMinutes + (returnTelem?.durationMinutes || 0)) / 60 * 10) / 10) + ' hrs' : outboundTelem.formattedDuration}</span>
                </div>
                <span className="rounded bg-emerald-100/80 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                  {isTwoWay ? 'Round Trip' : outboundTelem.tag}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Pickup</p>
                  <p className="truncate text-xs font-semibold text-slate-900">{pickupLabel}</p>
                </div>
              </div>
              <div className="my-1.5 ml-1.5 h-2.5 w-px bg-slate-200" />
              <div className="flex items-start gap-2">
                {config.requirement === 'airport' ? (
                  <Plane className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                ) : config.requirement === 'full_time' ? (
                  <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                ) : (
                  <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 rotate-90 text-brand-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    {config.requirement === 'full_time' ? 'Service Area' : 'Destination'}
                  </p>
                  <p className="truncate text-xs font-semibold text-slate-900">{destinationLabel}</p>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Driver Tier */}
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Driver Certification</h2>
            <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-0.5">
              <Sparkles className="h-2.5 w-2.5" /> Auto-matched
            </span>
          </div>
          <div className="-mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 pb-1 no-scrollbar">
            {SKILLS.map((s) => {
              const selected = s.id === config.skillId
              return (
                <span
                  key={s.id}
                  className={cn(
                    'shrink-0 rounded-xl border px-2.5 py-1.5 text-left',
                    selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white',
                  )}
                >
                  <span className={cn('block text-[10px] font-black', selected ? 'text-brand-600' : 'text-slate-900')}>
                    {s.label}
                  </span>
                  <span className="block text-[9px] text-slate-500">₹{s.rate}/km</span>
                </span>
              )
            })}
          </div>
        </section>

        {/* Speed Ceiling */}
        <section className="rounded-2xl border border-slate-200 bg-white p-2.5">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Gauge className="h-3 w-3" /> Speed ceiling
            </span>
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-black text-brand-600">
              {config.ceiling} km/h
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-brand-500"
              style={{ width: `${((config.ceiling - 40) / 80) * 100}%` }}
            />
          </div>
        </section>

        {/* VisionCam */}
        <section>
          <h2 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">VisionCam mode</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {VISION_MODES.map((mode) => {
              const selected = mode.id === config.visionMode
              return (
                <span
                  key={mode.id}
                  className={cn(
                    'rounded-xl border p-1.5 text-center',
                    selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white',
                  )}
                >
                  <span className={cn('block text-[10px] font-black', selected ? 'text-brand-600' : 'text-slate-900')}>
                    Mode {mode.id}
                  </span>
                  <span className="block text-[8px] text-slate-500">{mode.name}</span>
                </span>
              )
            })}
          </div>
        </section>

        {/* Price Breakdown */}
        <section className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="space-y-1 text-[10px]">
            {quote.lines.map((line) => (
              <div key={line.label} className="flex justify-between text-slate-500">
                <span>{line.label}</span>
                <span className="font-semibold text-slate-700">{line.value}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-xs">
              <span className="font-bold text-slate-900">Total</span>
              <span className="font-black text-brand-600">{quote.ready ? formatINR(quote.total) : '--'}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <span
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black',
            quote.ready ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400',
          )}
        >
          <Search className="h-3.5 w-3.5" />
          Find {quote.skill.label} Driver
        </span>
      </div>
    </div>
  )
}

