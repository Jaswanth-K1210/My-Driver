import { useCallback, useMemo, useState } from 'react'
import { DRIVERS, PAST_TRIPS } from '../data/mock.js'
import { TripContext } from './tripStore.js'
import { DEFAULT_CONFIG, buildTrip } from '../lib/booking.js'

/**
 * Owns the whole ride lifecycle so booking, tracking and the vault stay in
 * sync as the user moves between routes.
 *
 * phase: 'idle' → 'matching' → 'live' → 'complete' → 'idle'
 */
export function TripProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [phase, setPhase] = useState('idle')
  const [trip, setTrip] = useState(null)
  const [summary, setSummary] = useState(null)
  const [vaultTrips, setVaultTrips] = useState(PAST_TRIPS)

  const startMatching = useCallback((nextConfig) => {
    if (nextConfig) setConfig(nextConfig)
    setPhase('matching')
  }, [])

  const confirmMatch = useCallback((activeConfig) => {
    const built = buildTrip(activeConfig)
    setTrip({ ...built, driver: DRIVERS[built.driverIndex] ?? DRIVERS[0] })
    setPhase('live')
  }, [])

  const completeTrip = useCallback((result) => {
    setSummary(result)
    setPhase('complete')
  }, [])

  const cancelTrip = useCallback(() => {
    setTrip(null)
    setSummary(null)
    setPhase('idle')
  }, [])

  const saveToVault = useCallback(() => {
    if (!trip || !summary) return
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
        date: `${stamp}`,
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
    setTrip(null)
    setSummary(null)
    setConfig((prev) => ({ ...DEFAULT_CONFIG, skillId: prev.skillId, ceiling: prev.ceiling, visionMode: prev.visionMode }))
    setPhase('idle')
  }, [trip, summary])

  const value = useMemo(
    () => ({
      config,
      setConfig,
      phase,
      trip,
      summary,
      vaultTrips,
      startMatching,
      confirmMatch,
      completeTrip,
      cancelTrip,
      saveToVault,
      hasActiveTrip: phase === 'live' || phase === 'matching',
    }),
    [config, phase, trip, summary, vaultTrips, startMatching, confirmMatch, completeTrip, cancelTrip, saveToVault],
  )

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

