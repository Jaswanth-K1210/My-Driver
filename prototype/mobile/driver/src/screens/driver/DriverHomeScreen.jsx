import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IndianRupee, LogOut, Star, TrendingUp, XCircle, Zap } from 'lucide-react-native'
import { ActivityIndicator } from 'react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import ScoreRing from '../../components/ScoreRing'
import FakeStatusBar from '../../components/StatusBar'
import { useToast } from '../../components/Toast'
import { DRIVER_PROFILE } from '../../data/mock'
import Toggle from '../../components/Toggle'
import { useAuth } from '../../context/AuthContext'
import { useDriver } from '../../context/DriverContext'
import { formatINR } from '../../lib/utils'
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

export default function DriverHomeScreen({ onLogout }) {
  const { toast } = useToast()
  const { user, signOut } = useAuth()
  const { online, busy, summary, offer, goOnline, respondToOffer, connection } = useDriver()
  const [acting, setActing] = useState(false)

  // Offers arrive over the WebSocket from the real dispatcher.
  const request = offer

  const respond = async (accept) => {
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
    try {
      await goOnline(next)
      toast(next ? 'You are online — waiting for trips' : 'You are offline', 'info')
    } catch (err) {
      toast(err?.message ?? 'Could not change availability', 'warning')
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FakeStatusBar />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.xl,
          paddingBottom: space.md,
        }}
      >
        <View>
          <Text style={{ ...type.tiny, color: colors.textMuted }}>
            {online ? `Driver mode · online${connection === 'open' ? '' : ' · connecting'}` : 'Driver mode · offline'}
          </Text>
          <Text style={{ ...type.body, color: colors.text }}>
            {user?.full_name ?? user?.phone_number ?? DRIVER_PROFILE.name}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Pill label={DRIVER_PROFILE.badge} tone="brand" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out of MyDriver"
            onPress={async () => {
            await signOut()
            onLogout?.()
          }}
            style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 10 }}
          >
            <LogOut size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg }}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <ScoreRing score={Math.round(summary?.mydriver_score ?? DRIVER_PROFILE.score)} />
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
                <Text style={{ ...type.micro, color: colors.textMuted }}>Today&apos;s earnings</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <MiniStat value={String(summary?.trips_today ?? 0)} label="Trips today" />
              <MiniStat
                value={summary?.rating != null ? summary.rating.toFixed(1) : '—'}
                label="Harsh events"
                alert={false}
              />
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
            <Zap size={16} color={colors.red} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ ...type.caption, color: colors.text }}>
                Telematics live
              </Text>
              <Text style={{ ...type.micro, color: colors.textMuted }}>50 Hz sampling</Text>
            </View>
          </Card>
          <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
            <TrendingUp size={16} color={colors.graphite} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ ...type.caption, color: colors.text }}>
                +0.4 this week
              </Text>
              <Text style={{ ...type.micro, color: colors.textMuted }}>Score trend</Text>
            </View>
          </Card>
        </View>

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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Star size={13} color={colors.red} fill={colors.red} />
                <Text style={{ ...type.caption, color: colors.text }}>{request.rating}</Text>
              </View>
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

            {(request.vehicleSpecs || request.requirement || request.stops?.length > 0) && (
              <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md, flexWrap: 'wrap' }}>
                {request.vehicleSpecs && (
                  <>
                    <Pill label={`${request.vehicleSpecs.company} ${request.vehicleSpecs.model}`} />
                    <Pill label={request.vehicleSpecs.transmission} />
                  </>
                )}
                {request.requirement === 'airport' && request.flightNumber && (
                  <Pill label={`Flight ${request.flightNumber}`} tone="brand" />
                )}
                {request.tripType === 'two_way' && <Pill label="Round Trip" tone="brand" />}
                {request.stops?.length > 0 && (
                  <Pill label={`${request.stops.length} Stop${request.stops.length > 1 ? 's' : ''}`} />
                )}
                {request.requirement && (
                  <Pill label={request.requirement.replace('_', ' ')} style={{ textTransform: 'capitalize' }} />
                )}
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
              <Text style={{ ...type.title, color: colors.red, marginLeft: 'auto' }}>
                {formatINR(request.fare)}
              </Text>
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
