import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BadgeCheck, Check, IndianRupee } from 'lucide-react-native'
import Button from '../../components/Button'
import Card from '../../components/Card'
import { useDriver } from '../../context/DriverContext'
import { formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

export default function TripSummaryScreen({ request, result, onDone }) {
  // The server recomputes the score on completion; refreshSummary() already
  // ran in completeTrip(), so this is the post-trip figure.
  const { summary } = useDriver()
  // The server's figures come first. What this phone counted (time on the
  // drive screen, harsh events) is lost if the app restarted mid-trip, and is
  // then left out rather than guessed.
  const minutes =
    request.durationMin ?? (result.durationSec != null ? Math.max(1, Math.round(result.durationSec / 60)) : null)
  // Frozen by the server at completion: the fare less the platform fee.
  const totalFare = Number(request.fare ?? result.fare ?? 0)
  const payout = request.earnings ?? result.earnings ?? null
  const fee =
    request.platformFee != null
      ? Number(request.platformFee)
      : payout != null
        ? Math.max(0, Math.round(totalFare - payout))
        : 19
  const nightFee = Number(request.nightFee ?? 0)
  const baseFare = Math.max(0, Math.round((totalFare - fee - nightFee) * 100) / 100)

  const stats = [
    ...(request.distanceKm ? [{ label: 'Distance', value: `${Number(request.distanceKm.toFixed(1))} km`, alert: false }] : []),
    ...(minutes != null ? [{ label: 'Duration', value: `${Math.round(minutes)} min`, alert: false }] : []),
    ...(result.events != null
      ? [{ label: 'Harsh events', value: String(result.events), alert: result.events > 0 }]
      : []),
    // Completion is blocked until both inspections hold all 8 photos.
    { label: 'Inspection', value: '8/8', alert: false },
  ]

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xxl }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={28} color={colors.graphite} />
        </View>
        <Text style={{ ...type.headline, color: colors.text, marginTop: space.md }}>Trip settled</Text>
        <Text style={{ ...type.tiny, color: colors.textMuted }}>
          {request.id ? `${request.id} · ` : ''}Evidence sealed · score updated
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
      >
        <Card tone="alert" style={{ alignItems: 'center', padding: space.xl }}>
          <Text style={{ ...type.caption, color: colors.textMuted }}>Your net payout</Text>
          <Text style={{ ...type.display, color: colors.red, marginTop: space.xs }}>
            {payout != null ? formatINR(Math.round(payout)) : '—'}
          </Text>
          <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: space.xs }}>
            Customer fare {formatINR(totalFare)}
            {fee > 0 ? ` − platform fee ${formatINR(fee)}` : ''} · weekly settlement
          </Text>
        </Card>

        <Card style={{ gap: space.sm }}>
          <Text style={{ ...type.bodyBold, color: colors.text }}>Earnings breakdown</Text>
          {request.pickup || request.drop ? (
            <View style={{ gap: 4, paddingBottom: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              {request.pickup ? (
                <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
                  Pickup: {request.pickup}
                </Text>
              ) : null}
              {request.drop ? (
                <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
                  Drop: {request.drop}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>
              Base trip fare{request.distanceKm ? ` (${Number(request.distanceKm.toFixed(1))} km)` : ''}
            </Text>
            <Text style={{ ...type.caption, color: colors.text }}>{formatINR(baseFare)}</Text>
          </View>
          {nightFee > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...type.tiny, color: colors.textMuted }}>Night allowance</Text>
              <Text style={{ ...type.caption, color: colors.text }}>+{formatINR(nightFee)}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>Platform fee (customer)</Text>
            <Text style={{ ...type.caption, color: colors.textMuted }}>+{formatINR(fee)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...type.tiny, color: colors.text }}>Customer total fare</Text>
            <Text style={{ ...type.caption, color: colors.text }}>{formatINR(totalFare)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>Less: MyDriver platform fee</Text>
            <Text style={{ ...type.caption, color: colors.textMuted }}>−{formatINR(fee)}</Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: space.xs,
              marginTop: 2,
            }}
          >
            <Text style={{ ...type.bodyBold, color: colors.text }}>Your net earnings</Text>
            <Text style={{ ...type.bodyBold, color: colors.red }}>
              {payout != null ? formatINR(Math.round(payout)) : '—'}
            </Text>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {stats.map((s) => (
            <Card key={s.label} style={{ flex: 1, alignItems: 'center', padding: space.md }}>
              <Text style={{ ...type.bodyBold, color: s.alert ? colors.red : colors.text }}>{s.value}</Text>
              <Text style={{ ...type.micro, color: colors.textMuted, marginTop: 2 }}>{s.label}</Text>
            </Card>
          ))}
        </View>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <BadgeCheck size={32} color={colors.red} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...type.body, color: colors.text }}>
              {summary?.mydriver_score != null
                ? `MyDriver score ${Math.round(summary.mydriver_score)}`
                : 'MyDriver score'}
            </Text>
            <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 17 }}>
              Recalculated after every trip from speed, braking, cornering and customer ratings.
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
        }}
      >
        <Button label="Back to dashboard" icon={IndianRupee} onPress={onDone} />
      </View>
    </SafeAreaView>
  )
}
