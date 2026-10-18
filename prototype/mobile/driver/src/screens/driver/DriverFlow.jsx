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
import OnboardingScreen, {
  OnboardingLoading,
  OnboardingRetryScreen,
  useOnboarding,
} from './OnboardingScreen'
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
        {active === 'home' && <DriverHomeScreen onOpenProfile={() => setTab('profile')} />}
        {active === 'earnings' && <EarningsScreen />}
        {active === 'tests' && <AssessmentsScreen />}
        {active === 'profile' && <ProfileScreen onLogout={onLogout} />}
      </View>
      <TabBar tabs={TABS} active={active} onChange={setTab} />
    </View>
  )
}

/**
 * Phase follows the server trip status. Local gates sit on top:
 *   1. An in-progress trip (`IN_TRIP` or `ESCALATED`) owned by a previously
 *      verified `APPROVED` driver continues uninterrupted during transient
 *      network failures (`gate.canContinueActiveTrip`).
 *   2. A completed trip (`COMPLETED`) may display its read-only summary while
 *      fresh onboarding revalidation runs in parallel; dismissing it gates
 *      entry to `Tabs` on a freshly validated `APPROVED` status.
 *   3. Every other screen (including `HANDSHAKE_PENDING` and `Tabs`) requires
 *      fresh server confirmation of `onboarding_status === 'APPROVED'`.
 */
function Flow({ onLogout }) {
  const { trip, summary, profileComplete, refreshSummary, completeTrip, clearTrip, updateTripInspected } =
    useDriver()
  const { onboarding, gate, reload } = useOnboarding()
  // null until known. Restored from persisted active-trip snapshot on offline
  // restart, or queried from the server when online.
  const [inspected, setInspected] = useState(trip?.inspected ?? null)
  // Set when the driver taps End trip: the drive's figures, held while the
  // drop-off inspection is photographed.
  const [ending, setEnding] = useState(null)
  const [result, setResult] = useState(null)

  const tripId = trip?.serverId ?? null
  const preDue = trip?.status === 'IN_TRIP'

  useEffect(() => {
    setInspected(trip?.inspected ?? null)
  }, [tripId, trip?.inspected])

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
        if (!cancelled) {
          setInspected((known) => known ?? sealed)
          void updateTripInspected(sealed)
        }
      } catch {
        // If offline under the active-trip continuity exception and we had no
        // cached inspection flag, retry quietly when connectivity returns.
        if (!cancelled) retry = setTimeout(ask, 3000)
      }
    }
    void ask()
    return () => {
      cancelled = true
      clearTimeout(retry)
    }
  }, [tripId, preDue, inspected, updateTripInspected])

  // 1. Read-only completed trip summary remains accessible while post-trip
  //    revalidation runs in the background. Tapping Done clears the trip and
  //    immediately enforces the revalidation gate before showing Tabs.
  if (gate.viewMode === 'COMPLETED_SUMMARY' && trip?.status === 'COMPLETED') {
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

  // 2. Trusted active-trip continuity (`IN_TRIP` or `ESCALATED`): never redirect
  //    an ongoing drive to onboarding or a retry screen solely due to a transient
  //    network error.
  if (gate.canContinueActiveTrip && trip) {
    const driving = trip.status === 'IN_TRIP' || trip.status === 'ESCALATED'

    // If the app restarted offline during IN_TRIP before inspected state was
    // cached and the server is unreachable, allow the active drive screen when
    // continuityActive is in effect rather than trapping the driver on a spinner.
    if (preDue && inspected === null && !gate.continuityActive) {
      return <OnboardingLoading />
    }

    if (preDue && inspected === false) {
      return (
        <InspectionScreen
          tripId={trip.serverId}
          phase="PRE"
          onInspectionDone={() => {
            setInspected(true)
            void updateTripInspected(true)
          }}
        />
      )
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
  }

  // 3. No qualifying active trip in progress: enforce fresh onboarding validation.
  if (gate.viewMode === 'LOADING') {
    return <OnboardingLoading />
  }

  if (gate.viewMode === 'RETRY_REQUIRED') {
    return <OnboardingRetryScreen gate={gate} reload={reload} onLogout={onLogout} />
  }

  if (gate.viewMode === 'ONBOARDING' || !gate.freshlyApproved) {
    return (
      <OnboardingScreen
        onboarding={onboarding ?? { onboarding_status: gate.onboardingStatus }}
        reload={reload}
        onLogout={onLogout}
      />
    )
  }

  // 4. Freshly validated APPROVED driver: require profile setup (name + vehicle + plate)
  //    before going online or accepting new trips.
  if (!trip && !summary) {
    return <OnboardingLoading />
  }

  if (!trip && !profileComplete) {
    return (
      <ProfileScreen
        setupMode
        onSetupDone={() => void refreshSummary()}
        onLogout={onLogout}
      />
    )
  }

  if (!trip || trip.status === 'MATCHED') {
    return <Tabs onLogout={onLogout} />
  }

  if (trip.status === 'HANDSHAKE_PENDING') {
    return (
      <HandshakeScreen
        request={trip}
        onVerified={() => {
          setInspected(false)
          void updateTripInspected(false)
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
