import { User, Car } from 'lucide-react'
import { cn } from '../lib/utils.js'

export default function PhoneFrame({ role, onRoleChange, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-black tracking-tight text-slate-900">
          My<span className="text-brand-500">Driver</span> App Prototype
        </h1>
        <p className="text-xs text-slate-500">Simulated data · no backend · switch roles to explore both apps</p>
      </header>

      <div
        role="tablist"
        aria-label="App mode"
        className="flex rounded-full border border-slate-200 bg-white p-1"
      >
        {[
          { id: 'customer', label: 'Customer', icon: User },
          { id: 'driver', label: 'Driver', icon: Car },
        ].map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={role === mode.id}
            onClick={() => onRoleChange(mode.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold transition-colors',
              role === mode.id ? 'bg-brand-500 text-white' : 'text-slate-500 hover:text-slate-900',
            )}
          >
            <mode.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {mode.label}
          </button>
        ))}
      </div>

      <div className="relative w-full max-w-[390px] rounded-[2.75rem] border border-slate-300 bg-white p-2.5 shadow-2xl shadow-slate-300/60 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <div className="relative flex h-[780px] flex-col overflow-hidden rounded-[2.25rem] bg-white max-sm:h-screen max-sm:rounded-none">
          {children}
        </div>
      </div>
    </div>
  )
}
