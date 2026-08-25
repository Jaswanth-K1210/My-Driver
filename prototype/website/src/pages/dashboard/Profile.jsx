import { useCallback, useEffect, useState } from 'react'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { SectionCard, Toggle } from '../../components/app/Primitives.jsx'
import DemoBadge from '../../components/app/DemoBadge.jsx'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { MAX_GUARDIANS } from '../../data/mock.js'
import { api } from '../../lib/apiClient.js'
import { toE164 } from '../../lib/phone.js'
import { maskPhone } from '../../lib/utils.js'

export default function Profile() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [guardians, setGuardians] = useState([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [autoSos, setAutoSos] = useState(true)
  const [biometric, setBiometric] = useState(true)
  const [nightWatch, setNightWatch] = useState(true)

  const reload = useCallback(async () => {
    try {
      setGuardians(await api.me.guardians.list())
    } catch {
      setGuardians([])
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const addGuardian = async () => {
    const trimmed = name.trim()
    const digits = phone.replace(/\D/g, '')
    if (!trimmed) return toast('Enter guardian name', 'warning')
    if (digits.length !== 10) return toast('Enter a valid 10-digit mobile number', 'warning')
    if (guardians.length >= MAX_GUARDIANS) {
      return toast(`Up to ${MAX_GUARDIANS} guardians allowed`, 'warning')
    }

    setBusy(true)
    try {
      await api.me.guardians.add({ name: trimmed, relation: 'Guardian', phone: toE164(digits) })
      await reload()
      setName('')
      setPhone('')
      toast('Guardian added', 'success')
    } catch (err) {
      toast(err?.message ?? 'Could not add that guardian', 'warning')
    } finally {
      setBusy(false)
    }
    return undefined
  }

  const removeGuardian = async (id) => {
    try {
      await api.me.guardians.remove(id)
      await reload()
      toast('Guardian removed', 'info')
    } catch (err) {
      toast(err?.message ?? 'Could not remove that guardian', 'warning')
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Profile</h1>
        <p className="mt-1.5 text-sm text-slate-600">Manage your identity, guardians and safety defaults.</p>
      </header>

      <SectionCard>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-brand-50 text-xl font-black text-brand-600">
            {user.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-slate-900">{user.name}</p>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {user.phone ? `${user.phone} · ` : ''}Member since {user.memberSince}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-xs font-black text-brand-600">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            MD Verified
          </span>
        </div>
      </SectionCard>

      <SectionCard title={`Guardians · ${guardians.length}/${MAX_GUARDIANS}`}>
        {guardians.length === 0 && (
          <p className="py-4 text-sm text-slate-500">
            No guardians yet. Add up to {MAX_GUARDIANS} people who can follow your trips.
          </p>
        )}
        <ul className="divide-y divide-slate-200">
          {guardians.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-3 first:pt-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600">
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
                className="rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {guardians.length < MAX_GUARDIANS && (
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Guardian name"
              maxLength={40}
              aria-label="Guardian name"
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="numeric"
              maxLength={14}
              aria-label="Guardian mobile number"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none sm:w-44"
            />
            <button
              type="button"
              onClick={addGuardian}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            Safety defaults
            <DemoBadge title="These switches are local only until the escalation engine ships (Phase 2)" />
          </span>
        }
      >
        <div className="divide-y divide-slate-200">
          <Toggle checked={autoSos} onChange={setAutoSos} label="Volume-button Silent SOS" description="Triple-press the volume button to alert the Safety Desk." />
          <Toggle checked={biometric} onChange={setBiometric} label="Biometric trip unlock" description="Require Face ID or fingerprint before a trip starts." />
          <Toggle checked={nightWatch} onChange={setNightWatch} label="Night Watch monitoring" description="Live Safety Desk monitoring on every trip after 10 PM." />
        </div>
      </SectionCard>
    </div>
  )
}
