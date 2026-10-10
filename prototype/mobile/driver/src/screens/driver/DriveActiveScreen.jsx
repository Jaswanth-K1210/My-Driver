import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Activity, Flag, Gauge, Siren, Square } from 'lucide-react-native'
import Button from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
import * as Location from 'expo-location'
import { DeviceMotion } from 'expo-sensors'
import { useDriver } from '../../context/DriverContext'
import { colors, radius, space, type } from '../../theme/tokens'

const BRAKE_THRESHOLD = 0.4
const SWERVE_THRESHOLD = 0.35

function GForceBar({ label, value, threshold, max }) {
  const pct = Math.min(100, (value / max) * 100)
  const breach = value >= threshold
  const thresholdPct = (threshold / max) * 100

  return (
    <Card style={{ flex: 1, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
          {label.toUpperCase()}
        </Text>
        <Text style={{ ...type.bodyBold, color: breach ? colors.red : colors.text }}>
          {value.toFixed(2)}g
        </Text>
      </View>
      <View
        style={{
          height: 10,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceSunken,
          overflow: 'hidden',
          marginTop: space.sm,
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: radius.pill,
            backgroundColor: breach ? colors.red : colors.graphite,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            height: '100%',
            width: 2,
            left: `${thresholdPct}%`,
            backgroundColor: colors.textMuted,
          }}
        />
      </View>
      <Text style={{ ...type.micro, color: colors.textMuted, marginTop: 6 }}>Threshold {threshold}g</Text>
    </Card>
  )
}

export default function DriveActiveScreen({ request, onComplete }) {
  const { toast } = useToast()
  const { sendTelemetry, sendSos } = useDriver()
  const [finishing, setFinishing] = useState(false)
  const [speed, setSpeed] = useState(0)
  const [brakeG, setBrakeG] = useState(0)
  const [swerveG, setSwerveG] = useState(0)
  const [events, setEvents] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const [gpsDenied, setGpsDenied] = useState(false)
  const lastEventRef = useRef(0)
  const maxSpeedRef = useRef(0)
  // Latest sensor sample, read by the GPS callback so each telemetry frame
  // carries the g-force at the moment of the fix.
  const motionRef = useRef({ brake: 0, swerve: 0 })

  useEffect(() => {
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  // Motion: DeviceMotion reports acceleration with gravity already removed.
  // ponytail: assumes a portrait dash mount (y = forward, x = lateral); add a
  // mount-calibration step if drivers commonly mount landscape.
  useEffect(() => {
    let sub
    let cancelled = false
    ;(async () => {
      if (!(await DeviceMotion.isAvailableAsync()) || cancelled) return
      DeviceMotion.setUpdateInterval(200)
      sub = DeviceMotion.addListener(({ acceleration }) => {
        if (!acceleration) return
        const brake = Math.abs(acceleration.y ?? 0) / 9.81
        const swerve = Math.abs(acceleration.x ?? 0) / 9.81
        motionRef.current = { brake, swerve }
        setBrakeG(brake)
        setSwerveG(swerve)

        const now = Date.now()
        if (now - lastEventRef.current < 4000) return
        const text =
          brake >= BRAKE_THRESHOLD ? `Harsh braking ${brake.toFixed(2)}g`
            : swerve >= SWERVE_THRESHOLD ? `Sharp swerve ${swerve.toFixed(2)}g` : null
        if (!text) return
        lastEventRef.current = now
        setEvents((prev) => [{ id: now, text }, ...prev].slice(0, 4))
        toast(`${text} · logged`, 'warning')
      })
    })()
    return () => {
      cancelled = true
      sub?.remove()
    }
  }, [toast])

  // Position and speed from the device GPS. The server caps ingest at one
  // frame per second, so the watcher asks for no more than that.
  useEffect(() => {
    let sub
    let cancelled = false
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (cancelled) return
      if (status !== 'granted') {
        setGpsDenied(true)
        return
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        ({ coords }) => {
          const kmh = Math.max(0, Math.round((coords.speed ?? 0) * 3.6))
          setSpeed(kmh)
          maxSpeedRef.current = Math.max(maxSpeedRef.current, kmh)
          sendTelemetry(
            { lat: coords.latitude, lng: coords.longitude, speed: kmh, heading: coords.heading ?? 0 },
            {
              accel_z: Number(motionRef.current.brake.toFixed(3)),
              gyro_z: Number(motionRef.current.swerve.toFixed(3)),
            },
          )
        },
      )
      if (cancelled) sub.remove()
    })()
    return () => {
      cancelled = true
      sub?.remove()
    }
  }, [sendTelemetry])

  const raiseSos = async () => {
    try {
      await sendSos()
      toast('SOS sent. The Safety Desk is calling you now.', 'danger')
    } catch (err) {
      toast(err?.message ?? 'SOS could not be sent. Call 112.', 'danger')
    }
  }

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const overCeiling = speed > request.ceiling

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.lg }}>
        <Text style={{ ...type.tiny, color: colors.textMuted, textAlign: 'center' }}>
          Trip in progress · speed limit {request.ceiling} km/h
        </Text>
        <Text
          accessibilityLabel={`Elapsed time ${minutes} minutes ${seconds} seconds`}
          style={{ ...type.display, color: colors.text, marginTop: space.xs, fontVariant: ['tabular-nums'] }}
        >
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
      >
        {gpsDenied && (
          <Card tone="alert">
            <Text style={{ ...type.bodyBold, color: colors.redPressed }}>Location is off</Text>
            <Text style={{ ...type.tiny, color: colors.redPressed, marginTop: 4 }}>
              Allow location access in Settings. The customer and the Safety Desk cannot see this trip without it.
            </Text>
          </Card>
        )}
        <Card style={{ alignItems: 'center', padding: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Gauge size={12} color={colors.textMuted} />
            <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>CURRENT SPEED</Text>
          </View>
          <Text
            style={{
              fontSize: 52,
              fontWeight: '900',
              color: overCeiling ? colors.red : colors.text,
              fontVariant: ['tabular-nums'],
              marginTop: 2,
            }}
          >
            {speed}
          </Text>
          <Text style={{ ...type.caption, color: colors.textMuted }}>
            km/h · limit {request.ceiling}
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <GForceBar label="Braking" value={brakeG} threshold={BRAKE_THRESHOLD} max={0.8} />
          <GForceBar label="Swerving" value={swerveG} threshold={SWERVE_THRESHOLD} max={0.8} />
        </View>

        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm }}>
            <Activity size={13} color={colors.textMuted} />
            <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>EVENT LOG</Text>
          </View>
          {events.length === 0 ? (
            <Card style={{ alignItems: 'center', padding: space.md }}>
              <Text style={{ ...type.tiny, color: colors.textMuted }}>
                Smooth driving so far — no harsh events
              </Text>
            </Card>
          ) : (
            <View style={{ gap: 6 }}>
              {events.map((event) => (
                <View
                  key={event.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.red,
                    backgroundColor: colors.redSoft,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                  }}
                >
                  <Flag size={12} color={colors.redPressed} />
                  <Text style={{ ...type.tiny, color: colors.redPressed }}>{event.text}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
        }}
      >
        <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="SOS" icon={Siren} variant="danger" onPress={raiseSos} style={{ paddingHorizontal: space.xl }} />
        <Button
          style={{ flex: 1 }}
          label={finishing ? 'Ending trip…' : 'End trip'}
          icon={Square}
          variant="subtle"
          disabled={finishing}
          onPress={async () => {
            setFinishing(true)
            try {
              await onComplete({
                durationSec: elapsed,
                events: events.length,
                maxSpeed: maxSpeedRef.current,
              })
            } finally {
              setFinishing(false)
            }
          }}
        />
        </View>
      </View>
    </SafeAreaView>
  )
}
