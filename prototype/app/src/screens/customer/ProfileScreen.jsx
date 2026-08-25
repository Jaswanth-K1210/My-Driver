import { useState } from 'react'
import { Fingerprint, Lock, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { CUSTOMER, DEFAULT_GUARDIANS, MAX_GUARDIANS } from '../../data/mock.js'
import { cn, maskPhone } from '../../lib/utils.js'
import { useToast } from '../../components/Toast.jsx'

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-500' : 'bg-slate-200',
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

export default function ProfileScreen() {
  const { toast } = useToast()
  const [guardians, setGuardians] = useState(DEFAULT_GUARDIANS)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [autoSos, setAutoSos] = useState(true)
  const [biometric, setBiometric] = useState(true)
  const [nightWatch, setNightWatch] = useState(true)

  const addGuardian = () => {
    const trimmedName = name.trim()
    const digits = phone.replace(/\D/g, '')
    if (!trimmedName) {
      toast('Enter guardian name', 'warning')
      return
    }
    if (digits.length !== 10) {
      toast('Enter a valid 10-digit mobile number', 'warning')
      return
    }
    if (guardians.length >= MAX_GUARDIANS) {
      toast(`Up to ${MAX_GUARDIANS} guardians allowed`, 'warning')
      return
    }
    setGuardians((prev) => [
      ...prev,
      { id: `g-${Date.now()}`, name: trimmedName, relation: 'Guardian', phone: digits },
    ])
    setName('')
    setPhone('')
    toast('Guardian added', 'success')
  }

  const removeGuardian = (id) => {
    setGuardians((prev) => prev.filter((g) => g.id !== id))
    toast('Guardian removed', 'info')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-3 pt-6">
        <h1 className="text-lg font-black text-slate-900">Profile</h1>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 no-scrollbar">
        <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-base font-black text-brand-600">
            {CUSTOMER.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{CUSTOMER.name}</p>
            <p className="text-xs text-slate-500">
              Member since {CUSTOMER.memberSince} · {CUSTOMER.rating} rating
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-brand-600">MD Verified</span>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Emergency guardians">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Guardians · {guardians.length}/{MAX_GUARDIANS}
            </h2>
          </div>
          <ul className="space-y-2">
            {guardians.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-xl bg-white p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {g.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{g.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {g.relation} · {maskPhone(g.phone)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${g.name}`}
                  onClick={() => removeGuardian(g.id)}
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-700"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {guardians.length < MAX_GUARDIANS && (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Guardian name"
                maxLength={40}
                aria-label="Guardian name"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                  placeholder="10-digit mobile"
                  aria-label="Guardian mobile number"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addGuardian}
                  aria-label="Add guardian"
                  className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-500 px-4 text-xs font-black text-white transition-colors hover:bg-brand-600"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Safety settings">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Safety settings</h2>
          <Toggle checked={autoSos} onChange={setAutoSos} label="Silent SOS on triple volume press" />
          <Toggle checked={nightWatch} onChange={setNightWatch} label="Auto guardian-share on night trips" />
          <Toggle checked={biometric} onChange={setBiometric} label="Biometric app lock" />
        </section>

        <section className="grid grid-cols-3 gap-2" aria-label="Quick actions">
          {[
            { icon: ShieldCheck, label: 'Safety centre' },
            { icon: UserRound, label: 'Trusted contacts' },
            { icon: Lock, label: 'Privacy' },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => toast(`${item.label} opens here (demo)`, 'info')}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-3 text-center transition-colors hover:border-slate-300"
            >
              <item.icon className="h-4 w-4 text-brand-500" aria-hidden="true" />
              <span className="text-[10px] font-bold text-slate-700">{item.label}</span>
            </button>
          ))}
        </section>

        <p className="flex items-center justify-center gap-1.5 pb-2 pt-1 text-center text-[10px] text-slate-400">
          <Fingerprint className="h-3 w-3" aria-hidden="true" />
          Prototype build · all data is simulated locally
        </p>
      </div>
    </div>
  )
}
