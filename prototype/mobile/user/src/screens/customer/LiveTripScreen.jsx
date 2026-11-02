import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  AlertTriangle,
  Car,
  Gauge,
  KeyRound,
  RefreshCw,
  Siren,
  Star,
  Users,
  X,
} from 'lucide-react-native'
import TripMap from '../../components/TripMap'
import BottomSheet from '../../components/BottomSheet'
import Button from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/apiClient'
import { useTrip } from '../../context/TripContext'
import { formatINR, maskPhone } from '../../lib/utils'
import { useTripleVolumePress } from '../../lib/volumeSos'
import { colors, radius, space, type } from '../../theme/tokens'

// City average used for the ETA; the driver's live position supplies the distance.
const CITY_KMH = 25
const SOS_HOLD_MS = 1200
const SOS_COUNTDOWN_S = 5

const km = (a, b) => {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
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
  const { driverPosition, connection, rawTrip, setSummary } = useTrip()
  const [guardians, setGuardians] = useState([])

  // Real guardians from the account, for the share sheet.
  useEffect(() => {
    api.me.guardians
      .list()
      .then(setGuardians)
      .catch(() => setGuardians([]))
  }, [])

  const { toast } = useToast()
  const [maxSpeed, setMaxSpeed] = useState(0)
  const [breaches, setBreaches] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  // After the driver arrives, cancelling (or turning them away) costs a fee
  // paid to the driver. The amount is set by Finance in the console.
  const [arrivalFee, setArrivalFee] = useState(null)
  const [sosStage, setSosStage] = useState('idle')
  const [countdown, setCountdown] = useState(SOS_COUNTDOWN_S)
  const holdRef = useRef(null)

  // Speed, top speed and breaches come only from the driver's real
  // DRIVER_LOCATION frames; nothing on this screen is simulated.
  const liveSpeed = driverPosition?.speed != null ? Math.round(driverPosition.speed) : null
  const wasOverRef = useRef(false)
  useEffect(() => {
    if (liveSpeed == null) return
    setMaxSpeed((m) => Math.max(m, liveSpeed))
    const over = liveSpeed > trip.ceiling
    if (over && !wasOverRef.current) {
      setBreaches((b) => b + 1)
      toast(`Speed ${liveSpeed} km/h is over your ${trip.ceiling} km/h limit. Logged.`, 'warning')
    }
    wasOverRef.current = over
  }, [liveSpeed, trip.ceiling, toast])

  // Kept for the trip-complete screen. Only what this phone actually saw: if
  // the app was closed for part of the trip, the figures cover the rest.
  useEffect(() => {
    if (liveSpeed == null) return
    setSummary({ maxSpeed, breaches })
  }, [liveSpeed, maxSpeed, breaches, setSummary])

  const pickup = rawTrip?.pickup
  const drop = rawTrip?.drop
  // Before the handshake the driver is heading to the pickup, after it to the drop.
  const arriving = trip.status === 'HANDSHAKE_PENDING'
  const driverArrived = arriving && Boolean(rawTrip?.arrived_at)
  useEffect(() => {
    if (!driverArrived || arrivalFee !== null) return
    api.catalogue.tripConfig().then((c) => setArrivalFee(c?.fees?.arrival_cancellation_fee ?? null)).catch(() => undefined)
  }, [driverArrived, arrivalFee])
  const heading = arriving ? pickup : drop
  const left = driverPosition && heading ? km(driverPosition, heading) : null
  const etaMin = left != null ? Math.max(1, Math.ceil((left / CITY_KMH) * 60)) : null

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
        // Say it was sent only once the server has it.
        setSosStage('sending')
        api.trips
          .sos(rawTrip.id, { silent: true })
          .then(() => setSosStage('fired'))
          .catch(() => setSosStage('failed'))
      } else {
        setCountdown((c) => c - 1)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [sosStage, countdown, rawTrip?.id])

  // Optional second trigger, switched on in Profile: three presses of a volume
  // button open the same countdown without touching the screen.
  useTripleVolumePress(sosStage === 'idle', startSosCountdown)

  const overCeiling = liveSpeed != null && liveSpeed > trip.ceiling

  // The code the driver must enter to start the trip. Every request mints a
  // new one and cancels the last, so it is fetched once per trip, not on each
  // render, and again only when the customer asks.
  const [pickupCode, setPickupCode] = useState({ status: 'idle', otp: null })
  const codeForTrip = useRef(null)
  const loadPickupCode = useCallback(async () => {
    setPickupCode({ status: 'loading', otp: null })
    try {
      const { otp } = await api.trips.handshakeOtp(rawTrip.id)
      setPickupCode({ status: 'ready', otp })
    } catch {
      setPickupCode({ status: 'error', otp: null })
    }
  }, [rawTrip?.id])

  useEffect(() => {
    if (!arriving || !rawTrip?.id || codeForTrip.current === rawTrip.id) return
    codeForTrip.current = rawTrip.id
    void loadPickupCode()
  }, [arriving, rawTrip?.id, loadPickupCode])

  /** Texts every saved guardian, or hands the link to the share sheet. */
  const shareLink = async (bySms) => {
    setSharing(true)
    try {
      const link = await api.trips.guardianLink(rawTrip.id, bySms)
      if (bySms) {
        toast(`Live link texted to ${link.sent_to_guardians} guardian${link.sent_to_guardians === 1 ? '' : 's'}`, 'success')
      } else {
        await Share.share({ message: `Follow my MyDriver trip live: ${link.url}` })
      }
      setLinkSent(true)
      setSheetOpen(false)
    } catch (err) {
      toast(err?.message ?? 'Could not create the live link', 'warning')
    } finally {
      setSharing(false)
    }
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
        {arriving ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel trip"
            hitSlop={10}
            onPress={() => setConfirmCancel(true)}
            style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 10 }}
          >
            <X size={16} color={colors.text} />
          </Pressable>
        ) : (
          // Once the trip has started it can only be ended by the driver.
          <View style={{ width: 36 }} />
        )}
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

      {arriving ? (
        <Card tone="alert" style={{ marginHorizontal: space.lg, marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <KeyRound size={20} color={colors.red} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...type.micro, color: colors.redPressed, letterSpacing: 0.6 }}>
                {driverArrived ? 'YOUR DRIVER HAS ARRIVED' : 'PICKUP CODE'}
              </Text>
              <Text style={{ ...type.tiny, color: colors.text, lineHeight: 16 }}>
                {pickupCode.status === 'error'
                  ? 'Could not get your code. Check your connection.'
                  : driverArrived
                    ? 'Your driver is at the pickup. Meet them at the car and tell them this code.'
                    : 'Tell your driver this code at the car, not before. It starts the trip.'}
              </Text>
            </View>
            {pickupCode.status === 'ready' ? (
              <Text
                selectable
                accessibilityLabel={`Pickup code ${pickupCode.otp.split('').join(' ')}`}
                style={{ ...type.display, color: colors.redDeep, letterSpacing: 4 }}
              >
                {pickupCode.otp}
              </Text>
            ) : pickupCode.status === 'loading' ? (
              <ActivityIndicator color={colors.red} />
            ) : null}
          </View>
          {pickupCode.status === 'ready' || pickupCode.status === 'error' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pickupCode.status === 'error' ? 'Try again' : 'Get a new pickup code'}
              hitSlop={8}
              onPress={loadPickupCode}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm, alignSelf: 'flex-start', paddingVertical: 6 }}
            >
              <RefreshCw size={13} color={colors.redPressed} />
              <Text style={{ ...type.caption, color: colors.redPressed }}>
                {pickupCode.status === 'error' ? 'Try again' : 'Get a new code'}
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {confirmCancel && arriving ? (
        <Card tone="alert" style={{ marginHorizontal: space.lg, marginBottom: space.sm }}>
          <Text style={{ ...type.caption, color: colors.redPressed }}>
            {driverArrived ? 'Your driver is already at the pickup. Cancel anyway?' : 'Cancel this trip?'}
          </Text>
          <Text style={{ ...type.caption, fontWeight: '500', color: colors.textMuted, marginTop: 4 }}>
            {driverArrived
              ? `A cancellation fee${arrivalFee != null ? ` of ${formatINR(arrivalFee)}` : ''} is charged from your hold and paid to the driver for coming to you. The rest is released.`
              : 'Free until your driver arrives. The hold on your card is released.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Button
              label="Keep riding"
              variant="subtle"
              onPress={() => setConfirmCancel(false)}
              style={{ flex: 1 }}
            />
            <Button
              label={driverArrived ? `Cancel${arrivalFee != null ? ` · pay ${formatINR(arrivalFee)}` : ''}` : 'Cancel trip'}
              variant="danger"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      ) : null}

      <View
        style={{
          marginHorizontal: space.lg,
          height: 240,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <TripMap
          pickup={pickup}
          drop={drop}
          driver={driverPosition}
          pickupLabel={trip.from}
          dropLabel={trip.to}
          style={{ width: '100%', height: '100%' }}
        />
        <MapBadge tone={overCeiling ? 'alert' : 'neutral'} style={{ left: 10, top: 10 }}>
          {liveSpeed != null ? `${liveSpeed} km/h · limit ${trip.ceiling}` : `Limit ${trip.ceiling} km/h`}
        </MapBadge>
        {etaMin != null ? (
          <MapBadge style={{ right: 10, top: 10 }}>
            {driverArrived ? 'Driver at pickup' : arriving ? `Driver about ${etaMin} min away` : `About ${etaMin} min to go`}
          </MapBadge>
        ) : null}
        <MapBadge style={{ left: 10, bottom: 10 }}>
          {`${trip.statusLabel}${connection === 'open' ? '' : ' · reconnecting'}`}
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
                {[trip.driver.vehicle, trip.driver.plate].filter(Boolean).join(' · ') || 'Verified MyDriver driver'}
              </Text>
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
                <Text style={{ ...type.bodyBold, color: colors.text }}>{trip.driver.rating ?? "New"}</Text>
              </View>
              <Text style={{ ...type.micro, color: colors.textMuted }}>Rating</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ ...type.bodyBold, color: colors.text }}>{trip.driver.score != null ? Math.round(trip.driver.score) : "—"}</Text>
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

        <Text style={{ ...type.tiny, color: colors.textMuted, textAlign: 'center', lineHeight: 16 }}>
          Hold SOS for a second to alert the Safety Desk and your guardians.
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
          label={linkSent ? 'Link shared' : 'Share live link'}
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
        <Text style={{ ...type.caption, color: colors.textMuted, marginBottom: space.md, lineHeight: 18 }}>
          Guardians see your route, speed and stops live until the trip ends. The link expires automatically.
        </Text>
        <View style={{ gap: space.sm }}>
          {guardians.length === 0 ? (
            <Card tone="sunken">
              <Text style={{ ...type.caption, color: colors.textMuted }}>
                No guardians saved yet. Add them in Profile, or share the link with anyone below.
              </Text>
            </Card>
          ) : (
            guardians.map((g) => (
              <View
                key={g.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md }}
              >
                <View style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ ...type.caption, color: colors.text }}>{g.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ ...type.body, color: colors.text }}>{g.name}</Text>
                  <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
                    {g.relation} · {maskPhone(g.phone)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button
            label="Share link"
            variant="subtle"
            disabled={sharing}
            onPress={() => shareLink(false)}
            style={{ flex: 1 }}
          />
          <Button
            label={sharing ? 'Sending…' : 'Text guardians'}
            disabled={sharing || guardians.length === 0}
            onPress={() => shareLink(true)}
            style={{ flex: 1 }}
          />
        </View>
      </BottomSheet>

      {sosStage !== 'idle' ? (
        <View
          accessibilityViewIsModal
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
                <Text accessibilityLiveRegion="polite" style={{ ...type.display, color: colors.red }}>
                  {countdown}
                </Text>
              </View>
              <Text style={{ ...type.title, color: colors.text }}>Sending SOS in {countdown}</Text>
              <Text
                style={{
                  ...type.caption,
                  color: colors.textMuted,
                  textAlign: 'center',
                  maxWidth: 270,
                  lineHeight: 18,
                }}
              >
                The Safety Desk will get your live location and your guardians will be told. Your driver is not
                notified.
              </Text>
              <Button label="Cancel, I am safe" variant="subtle" onPress={() => setSosStage('idle')} />
            </>
          ) : sosStage === 'sending' ? (
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
                <Siren size={40} color={colors.red} />
              </View>
              <Text accessibilityLiveRegion="assertive" style={{ ...type.title, color: colors.text }}>
                Sending SOS
              </Text>
            </>
          ) : sosStage === 'failed' ? (
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
                <AlertTriangle size={40} color={colors.onRed} />
              </View>
              <Text
                accessibilityLiveRegion="assertive"
                style={{ ...type.title, color: colors.redDeep, textAlign: 'center' }}
              >
                The SOS did not reach us
              </Text>
              <Text
                style={{ ...type.caption, color: colors.textMuted, textAlign: 'center', maxWidth: 270, lineHeight: 18 }}
              >
                Your phone could not reach MyDriver. If you are in danger, call 112 now.
              </Text>
              <View style={{ width: '100%', maxWidth: 270, gap: space.sm }}>
                <Button label="Call 112" icon={Siren} variant="danger" onPress={() => Linking.openURL('tel:112')} />
                <Button label="Try the SOS again" variant="outline" onPress={startSosCountdown} />
                <Button label="Close" variant="ghost" onPress={() => setSosStage('idle')} />
              </View>
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
                <Text accessibilityLiveRegion="assertive" style={{ ...type.title, color: colors.redDeep }}>
                  SOS sent
                </Text>
              </View>
              <View style={{ width: '100%', maxWidth: 270, gap: space.sm }}>
                {[
                  'The Safety Desk has been alerted',
                  'Your live location is shared with the Safety Desk',
                  'Your guardians are being notified',
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
                    <Text style={{ ...type.caption, color: colors.redPressed, flex: 1 }}>{item}</Text>
                  </View>
                ))}
              </View>
              <View style={{ width: '100%', maxWidth: 270, gap: space.sm }}>
                <Button label="Call 112" icon={Siren} variant="outline" onPress={() => Linking.openURL('tel:112')} />
                <Button label="Back to the trip" variant="ghost" onPress={() => setSosStage('idle')} />
              </View>
            </>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  )
}
