import { useState } from 'react'
import { View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Archive, Home, UserRound } from 'lucide-react-native'
import { DRIVERS, DROPS, PAST_TRIPS, PICKUP, SKILLS } from '../../data/mock'
import { colors, type } from '../../theme/tokens'
import HomeScreen from './HomeScreen'
import MatchingScreen from './MatchingScreen'
import LiveTripScreen from './LiveTripScreen'
import TripCompleteScreen from './TripCompleteScreen'
import VaultScreen from './VaultScreen'
import ProfileScreen from './ProfileScreen'

const Tab = createBottomTabNavigator()

function assignedDriverFor(skillId) {
  const index = Math.max(
    SKILLS.findIndex((s) => s.id === skillId),
    0,
  )
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

const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.red,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
  },
  tabBarLabelStyle: { ...type.micro },
}

export default function CustomerFlow({ role, onRoleChange }) {
  // `phase` drives the booking journey. Tabs are only reachable while browsing,
  // matching the web prototype: once a trip is live it takes over the screen.
  const [phase, setPhase] = useState('browse')
  const [config, setConfig] = useState({
    dropId: null,
    skillId: 'MD-Standard',
    ceiling: 60,
    visionMode: 'R',
  })
  const [trip, setTrip] = useState(null)
  const [summary, setSummary] = useState(null)
  const [vaultTrips, setVaultTrips] = useState(PAST_TRIPS)

  const startMatching = () => setPhase('matching')

  const onMatched = () => {
    setTrip(buildTrip(config))
    setPhase('live')
  }

  const saveToVault = () => {
    const now = new Date()
    const stamp = now.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    const timeOnly = stamp.split(', ')[1] ?? stamp

    setVaultTrips((prev) => [
      {
        id: trip.id,
        date: `${stamp} · ${now.getFullYear()}`,
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
        preInspection: timeOnly,
        postInspection: timeOnly,
      },
      ...prev,
    ])
    setSummary(null)
    setTrip(null)
    setConfig((prev) => ({ ...prev, dropId: null }))
    setPhase('browse')
  }

  if (phase === 'matching') {
    return <MatchingScreen onMatched={onMatched} />
  }

  if (phase === 'live' && trip) {
    return (
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
    )
  }

  if (phase === 'done' && trip && summary) {
    return <TripCompleteScreen trip={trip} summary={summary} onSave={saveToVault} />
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tab.Navigator screenOptions={tabScreenOptions}>
        <Tab.Screen
          name="Ride"
          options={{ tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }}
        >
          {() => (
            <HomeScreen
              config={config}
              onChange={setConfig}
              onFindDriver={startMatching}
              role={role}
              onRoleChange={onRoleChange}
            />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="Vault"
          options={{ tabBarIcon: ({ color, size }) => <Archive size={size} color={color} /> }}
        >
          {() => <VaultScreen trips={vaultTrips} />}
        </Tab.Screen>
        <Tab.Screen
          name="Profile"
          options={{ tabBarIcon: ({ color, size }) => <UserRound size={size} color={color} /> }}
        >
          {() => <ProfileScreen />}
        </Tab.Screen>
      </Tab.Navigator>
    </View>
  )
}
