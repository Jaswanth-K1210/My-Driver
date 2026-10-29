import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IndianRupee, XCircle, Zap } from 'lucide-react-native'
import { ActivityIndicator } from 'react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import ScoreRing from '../../components/ScoreRing'
import { useToast } from '../../components/Toast'
import Toggle from '../../components/Toggle'
import { useAuth } from '../../context/AuthContext'
import { useDriver } from '../../context/DriverContext'
import { formatINR, offerTags } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

function MiniStat({ value, label, alert }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
      }}
    >
      <Text style={{ ...type.bodyBold, color: alert ? colors.red : colors.text }}>{value}</Text>
      <Text style={{ ...type.micro, color: colors.textMuted }}>{label}</Text>
    </View>
  )
}

export default function DriverHomeScreen({ onOpenProfile }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const {
    online,
    busy,
    summary,
    profileComplete,
    offer,
    onboardingGate,
    goOnline,
    respondToOffer,
    connection,
    platformFee,
  } = useDriver()
  const [acting, setActing] = useState(false)
  const canAct = Boolean(onboardingGate?.canStartOrAcceptNewRide)

  // Offers come from the real dispatcher: by push, with polling as the fallback.
  const request = canAct ? offer : null
  const tags = offerTags(request)

  const respond = async (accept) => {
    if (accept && summary && !profileComplete) {
      toast('Complete your driver profile before accepting a trip', 'warning')
      onOpenProfile?.()
      return
    }
    setActing(true)
    try {
      await respondToOffer(accept)
      toast(accept ? 'Trip accepted' : 'Request declined', accept ? 'success' : 'info')
    } catch (err) {
      toast(err?.message ?? 'That offer is no longer available', 'warning')
    } finally {
      setActing(false)
    }
  }

  const toggleOnline = async (next) => {
    if (next && !canAct) {
      toast('Verify your driver approval status before going online', 'warning')
      return
    }
    if (next && summary && !profileComplete) {
      toast('Complete your driver profile (name & vehicle details) before going online', 'warning')
      onOpenProfile?.()
      return
    }
    try {
      await goOnline(next)
      toast(next ? 'You are online — waiting for trips' : 'You are offline', 'info')
    } catch (err) {
      toast(err?.message ?? 'Could not change availability', 'warning')
    }
  }

  const driverName = summary?.full_name || user?.full_name || user?.phone_number || 'Driver'
  const vehicleLine = [summary?.vehicle_model, summary?.vehicle_plate].filter(Boolean).join(' · ')

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.xl,
          paddingBottom: space.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.tiny, color: colors.textMuted }}>
            {online ? `Driver mode · online${connection === 'open' ? '' : ' · connecting'}` : 'Driver mode · offline'}
          </Text>
          <Text numberOfLines={1} style={{ ...type.bodyBold, color: colors.text }}>
            {driverName}
          </Text>
          {vehicleLine ? (
            <Text numberOfLines={1} style={{ ...type.micro, color: colors.textMuted }}>
              {vehicleLine}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {summary?.rating ? <Pill label={`★ ${summary.rating.toFixed(1)}`} tone="brand" /> : null}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg }}
      >
        {summary && !profileComplete && (
          <Card tone="alert" style={{ gap: space.sm }}>
            <Text style={{ ...type.bodyBold, color: colors.redPressed }}>
              Complete your driver profile
            </Text>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>
              Add your full name and vehicle/plate details so customers can verify you on the live trip screen.
            </Text>
            {onOpenProfile && (
              <Button
                label="Set up profile details"
                onPress={onOpenProfile}
                style={{ paddingVertical: 10 }}
              />
            )}
          </Card>
        )}

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <ScoreRing score={Math.round(summary?.mydriver_score ?? 0)} />
          <View style={{ flex: 1, gap: space.sm }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceAlt,
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
              }}
            >
              <IndianRupee size={16} color={colors.red} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ ...type.bodyBold, color: colors.text }}>
                  {formatINR(Math.round(summary?.earnings_today ?? 0))}
                </Text>
                <Text style={{ ...type.micro, color: colors.textMuted }}>Today&apos;s net earnings</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <MiniStat value={String(summary?.trips_today ?? 0)} label="Trips today" />
              <MiniStat value={String(summary?.total_trips ?? 0)} label="Total trips" />
            </View>
          </View>
        </Card>

        <Card>
          <Toggle
            checked={online}
            onChange={toggleOnline}
            label={busy ? 'Updating…' : 'Available for trips'}
          />
          <Text style={{ ...type.micro, color: colors.textMuted, marginTop: 6 }}>
            Dispatch only offers trips to drivers who are online with a known position.
          </Text>
        </Card>

        {!request && (
          <Card>
            <View style={{ alignItems: 'center', gap: space.xs, paddingVertical: space.lg }}>
              {online ? <ActivityIndicator color={colors.red} /> : <Zap size={22} color={colors.textFaint} />}
              <Text style={{ ...type.body, color: colors.text }}>
                {online ? 'Waiting for a trip request…' : 'You are offline'}
              </Text>
              <Text style={{ ...type.micro, color: colors.textMuted, textAlign: 'center' }}>
                {online
                  ? 'Requests appear here the moment dispatch offers you one.'
                  : 'Go online to start receiving trip requests.'}
              </Text>
            </View>
          </Card>
        )}

        {request && (
        <View>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6, marginBottom: space.sm }}>
            INCOMING REQUEST
          </Text>
          <Card style={{ borderColor: colors.red }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ ...type.bodyBold, color: colors.text }}>{request.customer}</Text>
              <Pill label={request.skill} tone="neutral" />
            </View>

            <View style={{ gap: space.sm, marginTop: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: radius.pill,
                    backgroundColor: colors.graphite,
                    marginTop: 5,
                  }}
                />
                <Text style={{ ...type.caption, color: colors.text, flex: 1 }}>{request.pickup}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                <View
                  style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.red, marginTop: 5 }}
                />
                <Text style={{ ...type.caption, color: colors.text, flex: 1 }}>{request.drop}</Text>
              </View>
            </View>

            {tags.length > 0 && (
              <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md, flexWrap: 'wrap' }}>
                {tags.map((tag) => (
                  <Pill key={tag.label} label={tag.label} tone={tag.tone} />
                ))}
              </View>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                marginTop: space.md,
                paddingTop: space.md,
              }}
            >
              <Pill label={request.skill} />
              <Pill label={`${request.distanceKm} km`} />
              <Pill label={`Ceiling ${request.ceiling}`} />
              <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                <Text style={{ ...type.title, color: colors.red }}>
                  {formatINR(Math.round(request.earnings ?? Math.max(0, request.fare - (platformFee ?? 0))))}
                </Text>
                <Text style={{ ...type.micro, color: colors.textMuted }}>
                  Your net · Fare {formatINR(request.fare)}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
              <Button
                label="Decline"
                icon={XCircle}
                variant="subtle"
                disabled={acting}
                onPress={() => respond(false)}
                style={{ flex: 1 }}
              />
              <Button
                label="Accept & start"
                disabled={acting}
                onPress={() => respond(true)}
                style={{ flex: 1 }}
                accessibilityLabel="Accept and start handshake"
              />
            </View>
          </Card>
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
