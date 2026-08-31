import { Check, MapPin, Navigation, X } from 'lucide-react'
import { formatINR } from '../../../lib/utils.js'

export default function MobileDriverAcceptScreen({ trip }) {
  if (!trip) return null

  // We can construct the driver's view of the trip offer based on the trip payload
  const { config } = trip
  const isIntercity = config?.requirement === 'inter_city'
  const isAirport = config?.requirement === 'airport'
  
  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      <header className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-slate-800">
        <span className="text-xs font-bold text-slate-400">MyDriver Partner</span>
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          ONLINE
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/20 text-brand-400">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-20" />
            <Navigation className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-xl font-black text-white">New Booking Request</h2>
          <p className="mt-1 text-sm text-slate-400">12 seconds remaining to accept</p>
        </div>

        <div className="mt-8 space-y-4">
          <div className="rounded-2xl bg-slate-800 p-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Est. Earnings</span>
              <span className="text-xl font-black text-white">{formatINR(trip.fare)}</span>
            </div>
            
            <div className="mt-3 space-y-3">
              <div className="flex gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-brand-400 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400">PICKUP</p>
                  <p className="text-sm font-semibold text-white">{trip.from}</p>
                </div>
              </div>
              <div className="flex gap-3 border-t border-slate-700 pt-3">
                <Navigation className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400">DROP</p>
                  <p className="text-sm font-semibold text-white">{trip.to}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-800 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-400">Vehicle</p>
              <p className="mt-1 text-xs font-semibold text-white">
                {config?.carDetails?.company} {config?.carDetails?.model}
              </p>
              <p className="text-[10px] text-slate-500">{config?.carDetails?.transmission}</p>
            </div>
            <div className="rounded-2xl bg-slate-800 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-400">Requirement</p>
              <p className="mt-1 text-xs font-semibold text-white capitalize">
                {config?.requirement?.replace('_', ' ')}
              </p>
              {isIntercity && (
                <p className="text-[10px] text-brand-400 font-bold">{config?.interCityDays} Days</p>
              )}
              {isAirport && (
                <p className="text-[10px] text-brand-400 font-bold">Terminal {config?.airportDetails?.terminalId}</p>
              )}
            </div>
          </div>

          {(config?.stops?.length > 0 || config?.tripType === 'two_way') && (
            <div className="flex flex-wrap gap-2">
              {config?.stops?.length > 0 && (
                <span className="rounded-full bg-slate-800 px-3 py-1 text-[10px] font-bold text-slate-300">
                  {config.stops.length} Stop{config.stops.length > 1 ? 's' : ''}
                </span>
              )}
              {config?.tripType === 'two_way' && (
                <span className="rounded-full bg-brand-500/20 px-3 py-1 text-[10px] font-bold text-brand-400">
                  Round Trip
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 bg-slate-900 p-4 pb-6">
        <div className="flex gap-3">
          <button className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 active:scale-95 transition-transform">
            <X className="h-6 w-6" />
          </button>
          <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 font-black text-white active:scale-95 transition-transform shadow-lg shadow-brand-500/25">
            <Check className="h-5 w-5" />
            Accept Trip
          </button>
        </div>
      </div>
    </div>
  )
}
