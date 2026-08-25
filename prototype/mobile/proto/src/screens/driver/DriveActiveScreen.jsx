import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Activity, Flag, Gauge, Square } from 'lucide-react-native'
import Button from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
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
  const [speed, setSpeed] = useState(0)
  const [brakeG, setBrakeG] = useState(0.05)
  const [swerveG, setSwerveG] = useState(0.04)
  const [events, setEvents] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const lastEventRef = useRef(0)
  const maxSpeedRef = useRef(0)
  // Current g-force values also live in refs so the simulation can read the
  // previous sample without re-creating the interval each tick.
  const brakeRef = useRef(0.05)
  const swerveRef = useRef(0.04)

  useEffect(() => {
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  // The web prototype listed brakeG/swerveG as deps, which tore down and
  // rebuilt this interval on every tick. Reading the previous value from the
  // state updater keeps a single stable interval for the whole trip.
  useEffect(() => {
    const tick = setInterval(() => {
      const nextSpeed = Math.max(
        12,
        Math.min(request.ceiling + 8, Math.round(request.ceiling * (0.5 + Math.random() * 0.6))),
      )
      setSpeed(nextSpeed)
      maxSpeedRef.current = Math.max(maxSpeedRef.current, nextSpeed)

      const nextBrake = Math.max(0.02, Math.min(0.6, brakeRef.current + (Math.random() - 0.48) * 0.18))
      const nextSwerve = Math.max(0.02, Math.min(0.55, swerveRef.current + (Math.random() - 0.52) * 0.16))
      brakeRef.current = nextBrake
      swerveRef.current = nextSwerve
      setBrakeG(nextBrake)
      setSwerveG(nextSwerve)

      const now = Date.now()
      if (now - lastEventRef.current > 4000) {
        if (nextBrake >= BRAKE_THRESHOLD) {
          lastEventRef.current = now
          setEvents((prev) =>
            [{ id: now, text: `Harsh braking ${nextBrake.toFixed(2)}g` }, ...prev].slice(0, 4),
          )
          toast(`Harsh braking detected (${nextBrake.toFixed(2)}g) — logged`, 'warning')
        } else if (nextSwerve >= SWERVE_THRESHOLD) {
          lastEventRef.current = now
          setEvents((prev) =>
            [{ id: now, text: `Aggressive swerve ${nextSwerve.toFixed(2)}g` }, ...prev].slice(0, 4),
          )
          toast(`Aggressive swerve detected (${nextSwerve.toFixed(2)}g) — logged`, 'warning')
        }
      }
    }, 1200)
    return () => clearInterval(tick)
  }, [request.ceiling, toast])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const overCeiling = speed > request.ceiling

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.lg }}>
        <Text style={{ ...type.tiny, color: colors.textMuted, textAlign: 'center' }}>
          Trip in progress · {request.customer} · ceiling {request.ceiling} km/h
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
          <GForceBar label="Braking" value={brakeG} threshold={BRAKE_THRESHOLD} max={0.6} />
          <GForceBar label="Swerving" value={swerveG} threshold={SWERVE_THRESHOLD} max={0.55} />
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
        <Button
          label="End trip & settle fare"
          icon={Square}
          variant="subtle"
          onPress={() =>
            onComplete({
              durationSec: elapsed,
              events: events.length,
              maxSpeed: maxSpeedRef.current,
            })
          }
        />
      </View>
    </SafeAreaView>
  )
}
