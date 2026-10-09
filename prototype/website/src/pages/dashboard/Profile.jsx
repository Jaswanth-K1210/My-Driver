import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../components/app/PageHeader.jsx'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { SectionCard, Toggle } from '../../components/app/Primitives.jsx'
import IdentityCard from '../../components/app/IdentityCard.jsx'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { MAX_GUARDIANS } from '../../data/mock.js'
import { api } from '../../lib/apiClient.js'
import { toE164 } from '../../lib/phone.js'
import { formatPhone, maskPhone } from '../../lib/utils.js'

const CONSENT_VERSION = '2026-09'

const CONSENTS = [
  { purpose: 'LOCATION_TRACKING', label: 'Live location during trips', description: 'Lets the Safety Desk see where your trip is in real time.' },
  { purpose: 'TELEMATICS_COLLECTION', label: 'Speed and motion telemetry', description: 'Speed-limit and route-deviation alerts. Kept for 90 days.' },
  { purpose: 'GUARDIAN_SHARING', label: 'Share trips with guardians', description: 'Your guardians can be texted a live link and alerted on an SOS.' },
  { purpose: 'BIOMETRIC_LIVENESS', label: 'Driver face-match at pickup', description: 'The driver selfie at handshake is compared to their verified photo.' },
]

export default function Profile() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [guardians, setGuardians] = useState([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [consents, setConsents] = useState([])
  const [verified, setVerified] = useState(false)
  const onKyc = useCallback((k) => setVerified(k.verified), [])

  const reload = useCallback(async () => {
    try {
      setGuardians(await api.me.guardians.list())
    } catch {
      setGuardians([])
    }
  }, [])

  useEffect(() => {
    void reload()
    api.me.consents.list().then(setConsents).catch(() => setConsents([]))
  }, [reload])

  // The ledger is append-only: the newest row per purpose is the current state.
  const granted = (purpose) => {
    const latest = consents
      .filter((c) => c.purpose === purpose)
      .sort((a, b) => b.granted_at.localeCompare(a.granted_at))[0]
    return Boolean(latest && !latest.revoked_at)
  }

  const setConsent = async (purpose, on) => {
    try {
      await api.me.consents.record(purpose, CONSENT_VERSION, on)
      setConsents(await api.me.consents.list())
      toast(on ? 'Consent recorded' : 'Consent withdrawn', 'success')
    } catch (err) {
      toast(err?.message ?? 'Could not update consent', 'warning')
    }
  }

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
      <PageHeader title="Profile" subtitle="Your details, identity check, guardians and privacy choices." />

      <SectionCard>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-brand-50 text-xl font-black text-brand-600">
            {user.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-slate-900">{user.name}</p>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {[formatPhone(user.phone), user.memberSince && `Member since ${user.memberSince}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          {verified && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              ID verified
            </span>
          )}
        </div>
      </SectionCard>

      <IdentityCard onStatus={onKyc} />

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
              className="flex-1 h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="numeric"
              maxLength={14}
              aria-label="Guardian mobile number"
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none sm:w-44"
            />
            <button
              type="button"
              onClick={addGuardian}
              disabled={busy}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 text-sm font-bold text-white transition-colors hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Privacy and consents">
        <div className="divide-y divide-slate-200">
          {CONSENTS.map((c) => (
            <Toggle
              key={c.purpose}
              checked={granted(c.purpose)}
              onChange={(on) => setConsent(c.purpose, on)}
              label={c.label}
              description={c.description}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Every change is kept in your consent history. Withdrawing never deletes the record.
        </p>
      </SectionCard>
    </div>
  )
}
