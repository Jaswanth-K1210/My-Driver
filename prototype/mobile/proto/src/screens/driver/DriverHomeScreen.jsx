import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IndianRupee, Star, TrendingUp, XCircle, Zap } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import ScoreRing from '../../components/ScoreRing'
import FakeStatusBar from '../../components/StatusBar'
import RoleSwitch from '../../components/RoleSwitch'
import { useToast } from '../../components/Toast'
import { DRIVER_PROFILE, DRIVER_REQUESTS } from '../../data/mock'
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

export default function DriverHomeScreen({ onRequestAccepted, role, onRoleChange }) {
  const { toast } = useToast()
  const [requestIndex, setRequestIndex] = useState(0)
  const request = DRIVER_REQUESTS[requestIndex]

  const decline = () => {
    setRequestIndex((i) => (i + 1) % DRIVER_REQUESTS.length)
    toast('Request declined — finding next ride', 'info')
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
          <Text style={{ ...type.tiny, color: colors.textMuted }}>Driver mode · online</Text>
          <Text style={{ ...type.body, color: colors.text }}>{DRIVER_PROFILE.name}</Text>
        </View>
        <Pill label={DRIVER_PROFILE.badge} tone="brand" />
      </View>

      <View style={{ paddingHorizontal: space.xl, paddingBottom: space.md, alignItems: 'flex-start' }}>
        <RoleSwitch role={role} onChange={onRoleChange} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg }}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <ScoreRing score={DRIVER_PROFILE.score} />
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
                  {formatINR(DRIVER_PROFILE.todayEarnings)}
                </Text>
                <Text style={{ ...type.micro, color: colors.textMuted }}>Today&apos;s earnings</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <MiniStat value={String(DRIVER_PROFILE.todayTrips)} label="Trips" />
              <MiniStat
                value={String(DRIVER_PROFILE.harshEvents)}
                label="Harsh events"
                alert={DRIVER_PROFILE.harshEvents > 0}
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
              <Button label="Decline" icon={XCircle} variant="subtle" onPress={decline} style={{ flex: 1 }} />
              <Button
                label="Accept & start"
                onPress={() => onRequestAccepted(request)}
                style={{ flex: 1 }}
                accessibilityLabel="Accept and start handshake"
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
