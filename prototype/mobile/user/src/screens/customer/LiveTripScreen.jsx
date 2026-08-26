import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  AlertTriangle,
  Car,
  Gauge,
  MessageSquare,
  Phone,
  Siren,
  Star,
  Users,
  X,
} from 'lucide-react-native'
import MapCanvas from '../../components/MapCanvas'
import BottomSheet from '../../components/BottomSheet'
import Button from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/apiClient'
import { useTrip } from '../../context/TripContext'
import DemoBadge from '../../components/DemoBadge'
import { formatINR, maskPhone } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

const TOTAL_MINUTES = 18
const SOS_HOLD_MS = 1200
const SOS_COUNTDOWN_S = 5

function statusFor(progress) {
  if (progress < 8) return 'Driver is arriving at pickup'
  if (progress < 90) return 'On the way'
  if (progress < 100) return 'Arriving at destination'
  return 'Trip complete'
}

function MapBadge({ children, tone = 'neutral', style }) {
  const bg = tone === 'alert' ? colors.red : 'rgba(255,255,255,0.92)'
  const fg = tone === 'alert' ? colors.onRed : colors.text
  return (
    <View
      style={[
        {
          position: 'absolute',
          borderRadius: radius.sm,
          paddingHorizontal: space.sm,
          paddingVertical: 4,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Text style={{ ...type.tiny, color: fg }}>{children}</Text>
    </View>
  )
}

export default function LiveTripScreen({ trip, onCancel }) {
  const { driverPosition, connection } = useTrip()
  const [guardians, setGuardians] = useState([])

  // Real guardians from the account, for the share sheet.
  useEffect(() => {
    api.me.guardians
      .list()
      .then(setGuardians)
      .catch(() => setGuardians([]))
  }, [])

  const { toast } = useToast()
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(24)
  const [maxSpeed, setMaxSpeed] = useState(0)
  const [breaches, setBreaches] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sharedIds, setSharedIds] = useState([])
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [sosStage, setSosStage] = useState('idle')
  const [countdown, setCountdown] = useState(SOS_COUNTDOWN_S)
  const holdRef = useRef(null)
  const completedRef = useRef(false)

  useEffect(() => {
    const tick = setInterval(() => {
      setProgress((p) => Math.min(100, p + 0.4))
    }, 130)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const tick = setInterval(() => {
      const drift = 0.45 + Math.random() * 0.65
      const clamped = Math.max(18, Math.min(trip.ceiling + 16, Math.round(trip.ceiling * drift)))
      setSpeed(clamped)
      setMaxSpeed((m) => Math.max(m, clamped))
      if (clamped > trip.ceiling) {
        setBreaches((b) => b + 1)
        toast(`Speed breach ${clamped} km/h logged — guardians alerted`, 'warning')
      }
    }, 1600)
    return () => clearInterval(tick)
  }, [trip.ceiling, toast])

  // Latest telemetry and callback are read through refs so this effect depends
  // only on `progress`. Listing them as deps (as the web prototype did) re-ran
  // the effect mid-countdown, and the cleanup then cancelled the completion
  // timeout permanently, hanging the trip at 100%.
  const statsRef = useRef({ maxSpeed: 0, breaches: 0 })

  useEffect(() => {
    statsRef.current = { maxSpeed, breaches }
  })

  // There is deliberately no local completion timer. The driver ends the trip
  // server-side and TRIP_STATE_CHANGED moves this screen on; finishing locally
  // would show a completed ride while the server still had it running.

  useEffect(
    () => () => {
      if (holdRef.current) clearTimeout(holdRef.current)
    },
    [],
  )

  const startSosCountdown = useCallback(() => {
    setSosStage('armed')
    setCountdown(SOS_COUNTDOWN_S)
  }, [])

  useEffect(() => {
    if (sosStage !== 'armed') return undefined
    const t = setTimeout(() => {
      if (countdown <= 1) {
        setSosStage('fired')
        toast('Silent SOS sent — Safety Desk & guardians alerted', 'danger', 4000)
      } else {
        setCountdown((c) => c - 1)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [sosStage, countdown, toast])

  // A real DRIVER_LOCATION frame wins over the simulated trace.
  const liveSpeed = driverPosition?.speed
  const shownSpeed = liveSpeed != null ? Math.round(liveSpeed) : speed
  const overCeiling = shownSpeed > trip.ceiling
  const etaMin = Math.max(1, Math.ceil(TOTAL_MINUTES * (1 - progress / 100)))

  const toggleShare = (id) => {
    setSharedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const sendLinks = (channel) => {
    if (sharedIds.length === 0) {
      toast('Select at least one guardian', 'warning')
      return
    }
    toast(
      `Live link sent to ${sharedIds.length} guardian${sharedIds.length > 1 ? 's' : ''} via ${channel}`,
      'success',
    )
    setSheetOpen(false)
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.xl,
          paddingVertical: space.sm,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel trip"
          onPress={() => setConfirmCancel(true)}
          style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 8 }}
        >
          <X size={16} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ ...type.caption, color: colors.text }}>Trip {trip.id}</Text>
          <Text style={{ ...type.micro, color: colors.textMuted }}>
            {trip.skill} · ceiling {trip.ceiling} km/h
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceAlt,
            paddingHorizontal: space.sm,
            paddingVertical: 6,
          }}
        >
          <Gauge size={12} color={colors.text} />
          <Text style={{ ...type.micro, color: colors.text }}>{trip.ceiling}</Text>
        </View>
      </View>

      {confirmCancel ? (
        <Card tone="alert" style={{ marginHorizontal: space.lg, marginBottom: space.sm }}>
          <Text style={{ ...type.caption, color: colors.redPressed }}>Cancel this trip?</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Button
              label="Keep riding"
              variant="subtle"
              onPress={() => setConfirmCancel(false)}
              style={{ flex: 1 }}
            />
            <Button label="Cancel trip" variant="danger" onPress={onCancel} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      <View
        style={{
          marginHorizontal: space.lg,
          height: 200,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <MapCanvas progress={progress} style={{ width: '100%', height: '100%' }} />
        <MapBadge tone={overCeiling ? 'alert' : 'neutral'} style={{ left: 10, top: 10 }}>
          {`${shownSpeed} km/h / ceiling ${trip.ceiling}`}
        </MapBadge>
        <MapBadge style={{ right: 10, top: 10 }}>{`ETA ${etaMin} min`}</MapBadge>
        <MapBadge style={{ left: 10, bottom: 10 }}>
          {`${trip.statusLabel ?? statusFor(progress)}${connection === 'open' ? '' : ' · reconnecting'}`}
        </MapBadge>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.pill,
                backgroundColor: colors.redSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ ...type.bodyBold, color: colors.red }}>{trip.driver.initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ ...type.body, color: colors.text }}>
                {trip.driver.name}
              </Text>
              <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
                {trip.driver.vehicle} · {trip.driver.plate}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call driver"
                onPress={() => toast('Calling driver over masked number…', 'info')}
                style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 10 }}
              >
                <Phone size={16} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Message driver"
                onPress={() => toast('Secure chat opened (demo)', 'info')}
                style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 10 }}
              >
                <MessageSquare size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              marginTop: space.md,
              paddingTop: space.md,
            }}
          >
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Star size={13} color={colors.red} fill={colors.red} />
                <Text style={{ ...type.bodyBold, color: colors.text }}>{trip.driver.rating}</Text>
              </View>
              <Text style={{ ...type.micro, color: colors.textMuted }}>Rating</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ ...type.bodyBold, color: colors.text }}>{trip.driver.score}</Text>
              <Text style={{ ...type.micro, color: colors.textMuted }}>Safety score</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ ...type.bodyBold, color: breaches > 0 ? colors.red : colors.graphite }}>
                {breaches}
              </Text>
              <Text style={{ ...type.micro, color: colors.textMuted }}>Ceiling breaches</Text>
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Card style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Gauge size={12} color={colors.textMuted} />
              <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>MAX SPEED</Text>
            </View>
            <Text
              style={{
                ...type.headline,
                color: maxSpeed > trip.ceiling ? colors.red : colors.text,
                marginTop: 2,
              }}
            >
              {maxSpeed}
              <Text style={{ ...type.tiny, color: colors.textMuted }}> km/h</Text>
            </Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Car size={12} color={colors.textMuted} />
              <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>FARE LOCKED</Text>
            </View>
            <Text style={{ ...type.headline, color: colors.text, marginTop: 2 }}>
              {formatINR(trip.fare)}
            </Text>
          </Card>
        </View>

        <Text style={{ ...type.tiny, color: colors.textFaint, textAlign: 'center', lineHeight: 16 }}>
          Silent SOS also triggers on triple volume-button press. Guardians see route, speed and stops live.
        </Text>
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          gap: space.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
        }}
      >
        <Button
          label={sharedIds.length > 0 ? `Guardian link (${sharedIds.length})` : 'Guardian link'}
          icon={Users}
          variant="outline"
          onPress={() => setSheetOpen(true)}
          style={{ flex: 1 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hold for SOS"
          accessibilityHint="Press and hold for just over a second to arm the emergency alert"
          onPressIn={() => {
            holdRef.current = setTimeout(startSosCountdown, SOS_HOLD_MS)
          }}
          onPressOut={() => {
            if (holdRef.current) clearTimeout(holdRef.current)
          }}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.sm,
            borderRadius: radius.md,
            backgroundColor: pressed ? colors.redDeep : colors.red,
            paddingVertical: 14,
          })}
        >
          <Siren size={16} color={colors.onRed} />
          <Text style={{ ...type.bodyBold, color: colors.onRed }}>Hold for SOS</Text>
        </Pressable>
      </View>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Share guardian link">
        <View style={{ gap: space.sm }}>
          {guardians.map((g) => {
            const selected = sharedIds.includes(g.id)
            return (
              <Pressable
                key={g.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleShare(g.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: selected ? colors.red : colors.border,
                  backgroundColor: selected ? colors.redSoft : colors.surface,
                  padding: space.md,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.red : colors.surfaceAlt,
                  }}
                >
                  <Text style={{ ...type.caption, color: selected ? colors.onRed : colors.text }}>
                    {g.name.charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ ...type.body, color: colors.text }}>
                    {g.name}
                  </Text>
                  <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
                    {g.relation} · {maskPhone(g.phone)}
                  </Text>
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: selected ? colors.red : colors.borderStrong,
                    backgroundColor: selected ? colors.red : 'transparent',
                  }}
                />
              </Pressable>
            )
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button label="Send via SMS" variant="subtle" onPress={() => sendLinks('SMS')} style={{ flex: 1 }} />
          <Button label="Send via WhatsApp" onPress={() => sendLinks('WhatsApp')} style={{ flex: 1 }} />
        </View>
      </BottomSheet>

      {sosStage === 'armed' || sosStage === 'fired' ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 70,
            backgroundColor: colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.lg,
            padding: space.xxl,
          }}
        >
          {sosStage === 'armed' ? (
            <>
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: radius.pill,
                  backgroundColor: colors.redSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...type.display, color: colors.red }}>{countdown}</Text>
              </View>
              <Text style={{ ...type.title, color: colors.text }}>SOS activating…</Text>
              <Text
                style={{
                  ...type.tiny,
                  color: colors.textMuted,
                  textAlign: 'center',
                  maxWidth: 250,
                  lineHeight: 18,
                }}
              >
                Safety Desk will be alerted with live location and VisionCam stream. Guardians will be notified.
              </Text>
              <Button label="Cancel — I am safe" variant="subtle" onPress={() => setSosStage('idle')} />
            </>
          ) : (
            <>
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: radius.pill,
                  backgroundColor: colors.redDeep,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Siren size={40} color={colors.onRed} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} color={colors.redDeep} />
                <Text style={{ ...type.title, color: colors.redDeep }}>Emergency protocol active</Text>
              </View>
              <View style={{ width: '100%', maxWidth: 270, gap: space.sm }}>
                {[
                  'Safety Desk escalated to L3',
                  'Live location streaming',
                  'Guardians notified via SMS',
                  'VisionCam evidence sealing',
                ].map((item) => (
                  <View
                    key={item}
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
                    <View
                      style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.red }}
                    />
                    <Text style={{ ...type.tiny, color: colors.redPressed }}>{item}</Text>
                  </View>
                ))}
              </View>
              <Button label="End drill (demo)" variant="ghost" onPress={() => setSosStage('idle')} />
            </>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  )
}
