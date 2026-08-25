import { BatteryFull, Signal, Wifi } from 'lucide-react'

/**
 * Hardware frame used to preview the real mobile-app screens inside the web
 * dashboard, so the two surfaces can be compared side by side.
 */
export default function PhoneFrame({ children, label }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[300px] shrink-0 rounded-[2.75rem] border-[3px] border-slate-900 bg-slate-900 p-2 shadow-2xl shadow-slate-900/20">
        <div className="relative flex h-[620px] flex-col overflow-hidden rounded-[2.25rem] bg-white">
          <div className="absolute left-1/2 top-0 z-20 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-slate-900" aria-hidden="true" />
          <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-3 text-[11px] font-semibold text-slate-500">
            <span>9:41</span>
            <span className="flex items-center gap-1.5">
              <Signal className="h-3.5 w-3.5" aria-hidden="true" />
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              <BatteryFull className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="relative min-h-0 flex-1">{children}</div>
          <div className="mx-auto mb-2 mt-1 h-1 w-32 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
        </div>
      </div>
      {label && <p className="text-xs font-semibold text-slate-500">{label}</p>}
    </div>
  )
}
