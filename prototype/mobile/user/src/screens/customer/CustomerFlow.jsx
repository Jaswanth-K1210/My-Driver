import { Alert } from 'react-native'
import { View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Archive, Home, UserRound } from 'lucide-react-native'
import { colors, type } from '../../theme/tokens'
import { TripProvider, useTrip } from '../../context/TripContext'
import HomeScreen from './HomeScreen'
import MatchingScreen from './MatchingScreen'
import LiveTripScreen from './LiveTripScreen'
import TripCompleteScreen from './TripCompleteScreen'
import VaultScreen from './VaultScreen'
import ProfileScreen from './ProfileScreen'

const Tab = createBottomTabNavigator()

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

/**
 * Phase is driven entirely by the server trip status through TripContext —
 * dispatch, driver acceptance, the handshake and completion all happen
 * backend-side, so there is no local timer pretending a driver was found.
 */
function Flow({ onLogout }) {
  const { phase, trip, config, setConfig, summary, startMatching, cancelTrip, finishTrip } =
    useTrip()

  const findDriver = async (nextConfig) => {
    try {
      await startMatching(nextConfig)
    } catch (err) {
      Alert.alert('Could not book', err?.message ?? 'Please try again')
    }
  }

  if (phase === 'matching') {
    return (
      <MatchingScreen
        status={trip?.statusLabel}
        onCancel={() => {
          void cancelTrip('Cancelled while matching')
        }}
      />
    )
  }

  if (phase === 'live' && trip) {
    return (
      <LiveTripScreen
        trip={trip}
        onCancel={() => {
          void cancelTrip()
        }}
      />
    )
  }

  if (phase === 'done' && trip) {
    return (
      <TripCompleteScreen
        trip={trip}
        summary={summary ?? { maxSpeed: 0, breaches: 0 }}
        onSave={finishTrip}
      />
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tab.Navigator screenOptions={tabScreenOptions}>
        <Tab.Screen
          name="Ride"
          options={{ tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }}
        >
          {() => <HomeScreen config={config} onChange={setConfig} onFindDriver={findDriver} />}
        </Tab.Screen>
        <Tab.Screen
          name="Vault"
          options={{ tabBarIcon: ({ color, size }) => <Archive size={size} color={color} /> }}
        >
          {() => <VaultScreen />}
        </Tab.Screen>
        <Tab.Screen
          name="Profile"
          options={{ tabBarIcon: ({ color, size }) => <UserRound size={size} color={color} /> }}
        >
          {() => <ProfileScreen onLogout={onLogout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </View>
  )
}

export default function CustomerFlow({ onLogout }) {
  return (
    <TripProvider>
      <Flow onLogout={onLogout} />
    </TripProvider>
  )
}
