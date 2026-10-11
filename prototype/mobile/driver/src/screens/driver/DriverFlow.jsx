import { useEffect, useState } from 'react'
import { Alert, View } from 'react-native'
import { CircleUserRound, ClipboardCheck, House, IndianRupee } from 'lucide-react-native'
import TabBar from '../../components/TabBar'
import { colors } from '../../theme/tokens'
import { DriverProvider, useDriver } from '../../context/DriverContext'
import { api } from '../../lib/apiClient'
import DriverHomeScreen from './DriverHomeScreen'
import HandshakeScreen from './HandshakeScreen'
import InspectionScreen from './InspectionScreen'
import DriveActiveScreen from './DriveActiveScreen'
import TripSummaryScreen from './TripSummaryScreen'
import OnboardingScreen, { OnboardingLoading, useOnboarding } from './OnboardingScreen'
import EarningsScreen from './EarningsScreen'
import AssessmentsScreen from './AssessmentsScreen'
import ProfileScreen from './ProfileScreen'

const TABS = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'earnings', label: 'Earnings', icon: IndianRupee },
  { key: 'tests', label: 'Tests', icon: ClipboardCheck },
  { key: 'profile', label: 'Profile', icon: CircleUserRound },
]

/** What a driver sees between trips. An incoming offer always shows on Home. */
function Tabs({ onLogout }) {
  const { offer } = useDriver()
  const [tab, setTab] = useState('home')
  const active = offer ? 'home' : tab
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        {active === 'home' && <DriverHomeScreen />}
        {active === 'earnings' && <EarningsScreen />}
        {active === 'tests' && <AssessmentsScreen />}
        {active === 'profile' && <ProfileScreen onLogout={onLogout} />}
      </View>
      <TabBar tabs={TABS} active={active} onChange={setTab} />
    </View>
  )
}

/**
 * Phase follows the server trip status. Local gates sit on top: the driver
 * must be approved (onboarding), the pre-trip Trip Vault inspection must be
 * sealed between the handshake and the drive, and the drop-off inspection must
 * be sealed before the trip can be completed.
 */
function Flow({ onLogout }) {
  const { trip, completeTrip, clearTrip } = useDriver()
  const { onboarding, reload } = useOnboarding()
  // null until known. After a restart in the middle of a drive the server is
  // asked, so a sealed pre-trip inspection is not shown a second time.
  const [inspected, setInspected] = useState(null)
  // Set when the driver taps End trip: the drive's figures, held while the
  // drop-off inspection is photographed.
  const [ending, setEnding] = useState(null)
  const [result, setResult] = useState(null)

  const tripId = trip?.serverId ?? null
  const preDue = trip?.status === 'IN_TRIP'
  useEffect(() => {
    if (!tripId) {
      setInspected(null)
      return undefined
    }
    if (!preDue || inspected !== null) return undefined
    let cancelled = false
    let retry
    const ask = async () => {
      try {
        const { phases } = await api.trips.inspections(tripId)
        const sealed = phases.some((p) => p.phase === 'PRE' && p.sealed_at)
        if (!cancelled) setInspected((known) => known ?? sealed)
      } catch {
        if (!cancelled) retry = setTimeout(ask, 3000)
      }
    }
    void ask()
    return () => {
      cancelled = true
      clearTimeout(retry)
    }
  }, [tripId, preDue, inspected])

  if (!onboarding) return <OnboardingLoading />
  // Approval is the server's call; until then the driver only sees their checklist.
  if (onboarding.onboarding_status !== 'APPROVED') {
    return <OnboardingScreen onboarding={onboarding} reload={reload} onLogout={onLogout} />
  }

  if (!trip || trip.status === 'MATCHED') return <Tabs onLogout={onLogout} />

  // An escalated trip is still being driven; only the Safety Desk's view changes.
  const driving = trip.status === 'IN_TRIP' || trip.status === 'ESCALATED'

  if (trip.status === 'HANDSHAKE_PENDING') {
    return <HandshakeScreen request={trip} onVerified={() => setInspected(false)} />
  }

  // An incident is open on an ESCALATED trip: the driver needs the drive screen
  // and its SOS button, and the server no longer accepts a pre-trip inspection.
  if (preDue && inspected === null) return <OnboardingLoading />

  if (preDue && !inspected) {
    return <InspectionScreen tripId={trip.serverId} phase="PRE" onInspectionDone={() => setInspected(true)} />
  }

  if (driving && ending) {
    return (
      <InspectionScreen
        tripId={trip.serverId}
        phase="POST"
        onBack={() => setEnding(null)}
        onInspectionDone={async () => {
          try {
            const done = await completeTrip()
            setResult({ ...ending, fare: done.fare, earnings: done.earnings })
            setEnding(null)
          } catch (err) {
            Alert.alert('Could not complete the trip', err?.message ?? 'Please try again')
          }
        }}
      />
    )
  }

  if (driving) {
    return <DriveActiveScreen request={trip} onComplete={(tripResult) => setEnding(tripResult)} />
  }

  if (trip.status === 'COMPLETED') {
    return (
      <TripSummaryScreen
        request={trip}
        result={result ?? {}}
        onDone={() => {
          setResult(null)
          setEnding(null)
          clearTrip()
        }}
      />
    )
  }

  return <Tabs onLogout={onLogout} />
}

export default function DriverFlow({ onLogout }) {
  return (
    <DriverProvider>
      <Flow onLogout={onLogout} />
    </DriverProvider>
  )
}
