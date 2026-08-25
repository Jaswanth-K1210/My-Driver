import { useEffect, useRef, useState } from 'react'

const TOTAL_MINUTES = 18

export function statusFor(progress) {
  if (progress < 8) return 'Driver is arriving at pickup'
  if (progress < 90) return 'On the way'
  if (progress < 100) return 'Arriving at destination'
  return 'Trip complete'
}

/**
 * Simulates a live trip: route progress, speed drift and ceiling breaches.
 * A single instance feeds both the web tracking layout and the phone mirror so
 * the two always display identical numbers.
 */
export function useTripTelemetry({ ceiling, active, onBreach, onComplete }) {
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(24)
  const [maxSpeed, setMaxSpeed] = useState(0)
  const [breaches, setBreaches] = useState(0)

  // Callbacks are read through refs so the intervals below never re-subscribe
  // when a parent re-renders with a new inline function.
  const onBreachRef = useRef(onBreach)
  const onCompleteRef = useRef(onComplete)
  const statsRef = useRef({ maxSpeed: 0, breaches: 0 })
  const completedRef = useRef(false)

  useEffect(() => {
    onBreachRef.current = onBreach
    onCompleteRef.current = onComplete
    statsRef.current = { maxSpeed, breaches }
  })

  useEffect(() => {
    if (!active) return undefined
    const tick = setInterval(() => setProgress((p) => Math.min(100, p + 0.4)), 130)
    return () => clearInterval(tick)
  }, [active])

  useEffect(() => {
    if (!active) return undefined
    const tick = setInterval(() => {
      const drift = 0.45 + Math.random() * 0.65
      const next = Math.max(18, Math.min(ceiling + 16, Math.round(ceiling * drift)))
      setSpeed(next)
      setMaxSpeed((m) => Math.max(m, next))
      if (next > ceiling) {
        setBreaches((b) => b + 1)
        onBreachRef.current?.(next)
      }
    }, 1600)
    return () => clearInterval(tick)
  }, [active, ceiling])

  useEffect(() => {
    if (!active || progress < 100 || completedRef.current) return undefined
    completedRef.current = true
    const t = setTimeout(() => onCompleteRef.current?.(statsRef.current), 900)
    return () => clearTimeout(t)
  }, [active, progress])

  const reset = () => {
    completedRef.current = false
    setProgress(0)
    setSpeed(24)
    setMaxSpeed(0)
    setBreaches(0)
  }

  return {
    progress,
    speed,
    maxSpeed,
    breaches,
    reset,
    overCeiling: speed > ceiling,
    etaMin: Math.max(1, Math.ceil(TOTAL_MINUTES * (1 - progress / 100))),
    status: statusFor(progress),
  }
}
