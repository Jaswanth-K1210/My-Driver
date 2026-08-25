import { useState } from 'react'
import { Alert } from 'react-native'
import { DriverProvider, useDriver } from '../../context/DriverContext'
import DriverHomeScreen from './DriverHomeScreen'
import HandshakeScreen from './HandshakeScreen'
import InspectionScreen from './InspectionScreen'
import DriveActiveScreen from './DriveActiveScreen'
import TripSummaryScreen from './TripSummaryScreen'

/**
 * Phase follows the server trip status, with one local-only step: the 8-point
 * inspection has no backend in Phase 1, so it sits between the handshake and
 * the drive as a clearly-marked demo step.
 */
function Flow({ onLogout }) {
  const { trip, completeTrip, clearTrip } = useDriver()
  const [inspected, setInspected] = useState(false)
  const [result, setResult] = useState(null)

  if (!trip) return <DriverHomeScreen onLogout={onLogout} />

  if (trip.status === 'MATCHED') return <DriverHomeScreen onLogout={onLogout} />

  if (trip.status === 'HANDSHAKE_PENDING') {
    return <HandshakeScreen request={trip} onVerified={() => setInspected(false)} />
  }

  if (trip.status === 'IN_TRIP' && !inspected) {
    return <InspectionScreen onInspectionDone={() => setInspected(true)} />
  }

  if (trip.status === 'IN_TRIP') {
    return (
      <DriveActiveScreen
        request={trip}
        onComplete={async (tripResult) => {
          try {
            const done = await completeTrip()
            setResult({ ...tripResult, fare: done.fare, earnings: done.earnings })
          } catch (err) {
            Alert.alert('Could not complete the trip', err?.message ?? 'Please try again')
          }
        }}
      />
    )
  }

  if (trip.status === 'COMPLETED') {
    return (
      <TripSummaryScreen
        request={trip}
        result={result ?? { durationSec: (trip.durationMin ?? 1) * 60, events: 0 }}
        onDone={() => {
          setResult(null)
          setInspected(false)
          clearTrip()
        }}
      />
    )
  }

  return <DriverHomeScreen onLogout={onLogout} />
}

export default function DriverFlow({ onLogout }) {
  return (
    <DriverProvider>
      <Flow onLogout={onLogout} />
    </DriverProvider>
  )
}
