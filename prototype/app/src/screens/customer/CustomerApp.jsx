import { useEffect, useState } from 'react'
import { Archive, Home, UserRound } from 'lucide-react'
import { DRIVERS, DROPS, PAST_TRIPS, PICKUP, SKILLS } from '../../data/mock.js'
import { cn } from '../../lib/utils.js'
import HomeScreen, { MatchingOverlay } from './HomeScreen.jsx'
import LiveTripScreen from './LiveTripScreen.jsx'
import TripCompleteScreen from './TripCompleteScreen.jsx'
import VaultScreen, { TripDetail } from './VaultScreen.jsx'
import ProfileScreen from './ProfileScreen.jsx'
import Sheet from '../../components/Sheet.jsx'

const TABS = [
  { id: 'home', label: 'Ride', icon: Home },
  { id: 'vault', label: 'Vault', icon: Archive },
  { id: 'profile', label: 'Profile', icon: UserRound },
]

function assignedDriverFor(skillId) {
  const index = Math.max(SKILLS.findIndex((s) => s.id === skillId), 0)
  return DRIVERS[index]
}

function buildTrip(config) {
  const drop = DROPS.find((d) => d.id === config.dropId)
  const skill = SKILLS.find((s) => s.id === config.skillId)
  const nightFee = config.skillId === 'MD-Night' ? 30 : 0
  return {
    id: 'TRP-8493',
    from: PICKUP.name,
    to: drop.name,
    distanceKm: drop.distanceKm,
    skill: skill.id,
    ceiling: config.ceiling,
    visionMode: config.visionMode,
    fare: Math.round(drop.distanceKm * skill.rate + 19 + nightFee),
    driver: assignedDriverFor(config.skillId),
  }
}

export default function CustomerApp() {
  const [tab, setTab] = useState('home')
  const [phase, setPhase] = useState('browse')
  const [config, setConfig] = useState({ dropId: null, skillId: 'MD-Standard', ceiling: 60, visionMode: 'R' })
  const [trip, setTrip] = useState(null)
  const [summary, setSummary] = useState(null)
  const [vaultTrips, setVaultTrips] = useState(PAST_TRIPS)
  const [detailTrip, setDetailTrip] = useState(null)

  useEffect(() => {
    if (phase !== 'matching') return
    const t = setTimeout(() => {
      setTrip(buildTrip(config))
      setPhase('live')
    }, 1800)
    return () => clearTimeout(t)
  }, [phase, config])

  const showTabs = phase === 'browse'

  const saveToVault = () => {
    const now = new Date()
    const stamp = now.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    setVaultTrips((prev) => [
      {
        id: trip.id,
        date: `${stamp} · ${new Date().getFullYear()}`,
        from: trip.from,
        to: trip.to,
        skill: trip.skill,
        driver: trip.driver.name,
        fare: trip.fare,
        maxSpeed: summary.maxSpeed,
        ceiling: trip.ceiling,
        visionMode: trip.visionMode,
        breaches: summary.breaches,
        certId: `MV-${now.getFullYear()}-08493`,
        preInspection: stamp.split(', ')[1] ?? stamp,
        postInspection: stamp.split(', ')[1] ?? stamp,
      },
      ...prev,
    ])
    setDetailTrip(null)
    setSummary(null)
    setTrip(null)
    setConfig({ dropId: null, skillId: config.skillId, ceiling: config.ceiling, visionMode: config.visionMode })
    setTab('vault')
    setPhase('browse')
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="min-h-0 flex-1">
        {phase === 'browse' && tab === 'home' && (
          <HomeScreen config={config} onChange={setConfig} onFindDriver={() => setPhase('matching')} />
        )}
        {phase === 'browse' && tab === 'vault' && <VaultScreen trips={vaultTrips} onOpenTrip={setDetailTrip} />}
        {phase === 'browse' && tab === 'profile' && <ProfileScreen />}
        {phase === 'matching' && <MatchingOverlay />}
        {phase === 'live' && trip && (
          <LiveTripScreen
            trip={trip}
            onComplete={(result) => {
              setSummary(result)
              setPhase('done')
            }}
            onCancel={() => {
              setTrip(null)
              setPhase('browse')
            }}
          />
        )}
        {phase === 'done' && trip && summary && (
          <TripCompleteScreen trip={trip} summary={summary} onSave={saveToVault} />
        )}
      </div>

      {showTabs && (
        <nav className="flex border-t border-slate-200 bg-white/95 px-2 pb-5 pt-2" aria-label="App tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors',
                tab === t.id ? 'text-brand-500' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <t.icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px] font-bold">{t.label}</span>
            </button>
          ))}
        </nav>
      )}

      <Sheet open={Boolean(detailTrip)} onClose={() => setDetailTrip(null)} title="Sealed trip record">
        {detailTrip && <TripDetail trip={detailTrip} />}
      </Sheet>
    </div>
  )
}
