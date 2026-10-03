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

/* ── Small UI helpers ─────────────────────────────────────────────────────── */

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

function SmallStatCard({ icon: Icon, label, value, danger = false, onPress }) {
  const content = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Icon size={12} color={colors.textMuted} />
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
          {label}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 17,
          fontWeight: '900',
          color: danger ? colors.red : colors.text,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
          padding: space.md,
        })}
      >
        {content}
      </Pressable>
    )
  }

  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: space.md,
      }}
    >
      {content}
    </View>
  )
}

/* ── Handshake OTP Banner ─────────────────────────────────────────────────── */

function HandshakeCard({ otp }) {
  return (
    <View
      style={{
        marginHorizontal: space.lg,
        marginBottom: space.sm,
        borderRadius: radius.lg,
        borderWidth: 2,
        borderColor: colors.brand,
        backgroundColor: colors.brandSoft,
        padding: space.lg,
        gap: space.sm,
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.brand,
          }}
        />
        <Text
          style={{
            ...type.micro,
            color: colors.brand,
            letterSpacing: 0.8,
            fontWeight: '900',
          }}
        >
          PICKUP HANDSHAKE REQUIRED
        </Text>
      </View>

      {/* Title + description */}
      <Text style={{ ...type.bodyBold, color: colors.text }}>
        Share your 4-digit OTP with your driver
      </Text>
      <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 17 }}>
        The driver will verify your OTP and take a quick safety selfie before starting the engine.
      </Text>

      {/* OTP display */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm }}>
        <Text style={{ ...type.tiny, color: colors.textMuted }}>Your OTP:</Text>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.brand,
            borderRadius: radius.md,
            paddingVertical: 12,
            paddingHorizontal: space.md,
          }}
        >
          <Text
            style={{
              fontSize: 26,
              fontWeight: '900',
              color: '#fff',
              letterSpacing: 8,
              fontFamily: 'monospace',
            }}
          >
            {otp ?? '· · · ·'}
          </Text>
        </View>
      </View>
    </View>
  )
}

/* ── Trip Progress Bar ────────────────────────────────────────────────────── */

function TripProgressBar({ progress }) {
  const pct = Math.max(0, Math.min(100, progress))
  const barColor = pct >= 90 ? colors.green : colors.brand

  return (
    <View
      style={{
        marginHorizontal: space.lg,
        marginTop: space.sm,
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', flex: 1 }}>
        {pct > 0 && (
          <View
            style={{
              flex: pct / 100,
              backgroundColor: barColor,
              borderRadius: 3,
            }}
          />
        )}
        {pct < 100 && (
          <View
            style={{
              flex: (100 - pct) / 100,
              backgroundColor: 'transparent',
            }}
          />
        )}
      </View>
    </View>
  )
}

/* ── Main Screen ──────────────────────────────────────────────────────────── */

export default function LiveTripScreen({ trip, onCancel }) {
  const { driverPosition, connection, rawTrip } = useTrip()
  const [guardians, setGuardians] = useState([])
  const [handshakeOtp, setHandshakeOtp] = useState(null)

  // Fetch real guardians for the share sheet
  useEffect(() => {
    api.me.guardians
      .list()
      .then(setGuardians)
      .catch(() => setGuardians([]))
  }, [])

  // Fetch handshake OTP when driver has accepted but trip hasn't started yet
  useEffect(() => {
    if (rawTrip?.status === 'HANDSHAKE_PENDING' && rawTrip?.id) {
      api.trips
        .handshakeOtp(rawTrip.id)
        .then((res) => setHandshakeOtp(res?.otp ?? res?.data?.otp ?? null))
        .catch(() => setHandshakeOtp(null))
    } else {
      setHandshakeOtp(null)
    }
  }, [rawTrip?.status, rawTrip?.id])

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

  const statsRef = useRef({ maxSpeed: 0, breaches: 0 })
  useEffect(() => {
    statsRef.current = { maxSpeed, breaches }
  })

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

  const liveSpeed = driverPosition?.speed
  const shownSpeed = liveSpeed != null ? Math.round(liveSpeed) : speed
  const overCeiling = shownSpeed > trip.ceiling
  const etaMin = Math.max(1, Math.ceil(TOTAL_MINUTES * (1 - progress / 100)))
  const isHandshakePending = rawTrip?.status === 'HANDSHAKE_PENDING'
  const isLive = connection === 'open'

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

      {/* ── App Bar ── */}
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

        {/* Connection badge */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            borderRadius: radius.sm,
            backgroundColor: isLive ? '#f0fdf4' : colors.amberSoft,
            paddingHorizontal: space.sm,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: isLive ? '#bbf7d0' : '#fcd34d',
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: isLive ? colors.green : colors.amber,
            }}
          />
          <Text
            style={{
              ...type.micro,
              color: isLive ? colors.green : colors.amber,
              fontWeight: '800',
            }}
          >
            {isLive ? 'Live' : 'Reconnecting'}
          </Text>
        </View>
      </View>

      {/* ── Cancel confirm banner ── */}
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

      {/* ── Handshake OTP banner (only when HANDSHAKE_PENDING) ── */}
      {isHandshakePending && <HandshakeCard otp={handshakeOtp} />}

      {/* ── Map ── */}
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
          {`${shownSpeed} km/h / ceil. ${trip.ceiling}`}
        </MapBadge>
        <MapBadge style={{ right: 10, top: 10 }}>{`ETA ${etaMin} min`}</MapBadge>
        <MapBadge style={{ left: 10, bottom: 10 }}>
          {`${trip.statusLabel ?? statusFor(progress)} · ${Math.round(progress)}%`}
        </MapBadge>
      </View>

      {/* ── Trip Progress Bar ── */}
      <TripProgressBar progress={progress} />

      {/* ── Scrollable content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
      >
        {/* Driver Card */}
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

          {/* Driver stats */}
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

        {/* ── Telemetry Stat Cards (3 in a row) ── */}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <SmallStatCard
            icon={Gauge}
            label="MAX SPEED"
            value={`${maxSpeed} km/h`}
            danger={maxSpeed > trip.ceiling}
          />
          <SmallStatCard
            icon={Car}
            label="FARE LOCKED"
            value={formatINR(trip.fare)}
          />
          <SmallStatCard
            icon={Users}
            label="GUARDIANS"
            value={`${sharedIds.length}/${guardians.length}`}
            onPress={() => setSheetOpen(true)}
          />
        </View>

        <Text style={{ ...type.tiny, color: colors.textFaint, textAlign: 'center', lineHeight: 16 }}>
          Silent SOS also triggers on triple volume-button press. Guardians see route, speed and stops live.
        </Text>
      </ScrollView>

      {/* ── Sticky action bar ── */}
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

      {/* ── Guardian bottom sheet ── */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Share guardian link">
        <View style={{ gap: space.sm }}>
          {guardians.length === 0 ? (
            <View
              style={{
                borderRadius: radius.md,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.border,
                padding: space.xl,
                alignItems: 'center',
              }}
            >
              <Users size={24} color={colors.textFaint} />
              <Text style={{ ...type.caption, color: colors.textMuted, marginTop: space.sm, textAlign: 'center' }}>
                No guardians yet — add up to 3 in your Profile.
              </Text>
            </View>
          ) : (
            guardians.map((g) => {
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
            })
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button label="Send via SMS" variant="subtle" onPress={() => sendLinks('SMS')} style={{ flex: 1 }} />
          <Button label="Send via WhatsApp" onPress={() => sendLinks('WhatsApp')} style={{ flex: 1 }} />
        </View>
      </BottomSheet>

      {/* ── SOS Full-Screen Overlay ── */}
      {sosStage === 'armed' || sosStage === 'fired' ? (
        <View
          style={{
            position: 'absolute',
            top: 0, right: 0, bottom: 0, left: 0,
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
                  width: 96, height: 96,
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
                Safety Desk will be alerted with live location and VisionCam stream. Guardians will be
                notified.
              </Text>
              <Button label="Cancel — I am safe" variant="subtle" onPress={() => setSosStage('idle')} />
            </>
          ) : (
            <>
              <View
                style={{
                  width: 96, height: 96,
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
