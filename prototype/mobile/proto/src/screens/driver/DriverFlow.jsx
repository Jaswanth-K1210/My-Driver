import { useState } from 'react'
import DriverHomeScreen from './DriverHomeScreen'
import HandshakeScreen from './HandshakeScreen'
import InspectionScreen from './InspectionScreen'
import DriveActiveScreen from './DriveActiveScreen'
import TripSummaryScreen from './TripSummaryScreen'

export default function DriverFlow({ role, onRoleChange }) {
  const [phase, setPhase] = useState('home')
  const [request, setRequest] = useState(null)
  const [result, setResult] = useState(null)

  if (phase === 'home') {
    return (
      <DriverHomeScreen
        role={role}
        onRoleChange={onRoleChange}
        onRequestAccepted={(req) => {
          setRequest(req)
          setPhase('handshake')
        }}
      />
    )
  }

  if (phase === 'handshake') {
    return (
      <HandshakeScreen
        request={request}
        onVerified={() => setPhase('inspection')}
        onBack={() => setPhase('home')}
      />
    )
  }

  if (phase === 'inspection') {
    return (
      <InspectionScreen
        onInspectionDone={() => setPhase('active')}
        onBack={() => setPhase('handshake')}
      />
    )
  }

  if (phase === 'active') {
    return (
      <DriveActiveScreen
        request={request}
        onComplete={(tripResult) => {
          setResult(tripResult)
          setPhase('summary')
        }}
      />
    )
  }

  return <TripSummaryScreen request={request} result={result} onDone={() => setPhase('home')} />
}
