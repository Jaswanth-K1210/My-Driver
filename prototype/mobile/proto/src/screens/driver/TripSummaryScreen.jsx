import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BadgeCheck, Check, IndianRupee } from 'lucide-react-native'
import Button from '../../components/Button'
import Card from '../../components/Card'
import { DRIVER_PROFILE } from '../../data/mock'
import { formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

export default function TripSummaryScreen({ request, result, onDone }) {
  const minutes = Math.max(1, Math.round(result.durationSec / 60))
  const payout = Math.round(request.fare * 0.82)

  const stats = [
    { label: 'Duration', value: `${minutes} min`, alert: false },
    { label: 'Harsh events', value: String(result.events), alert: result.events > 0 },
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
        <Text style={{ ...type.tiny, color: colors.textMuted }}>Evidence sealed · score updated</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
      >
        <Card tone="alert" style={{ alignItems: 'center', padding: space.xl }}>
          <Text style={{ ...type.caption, color: colors.textMuted }}>Your payout (82%)</Text>
          <Text style={{ ...type.display, color: colors.red, marginTop: space.xs }}>
            {formatINR(payout)}
          </Text>
          <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: space.xs }}>
            Fare {formatINR(request.fare)} · weekly settlement
          </Text>
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
            <Text style={{ ...type.body, color: colors.text }}>Score impact</Text>
            <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 17 }}>
              {result.events === 0
                ? `Clean run — score holds at ${DRIVER_PROFILE.score}.`
                : `${result.events} event${result.events > 1 ? 's' : ''} logged — minor review, no deduction.`}
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
