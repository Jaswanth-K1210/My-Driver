import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Archive, Check, Star } from 'lucide-react-native'
import MapCanvas from '../../components/MapCanvas'
import Button from '../../components/Button'
import Card from '../../components/Card'
import DemoBadge from '../../components/DemoBadge'
import { useTrip } from '../../context/TripContext'
import { useToast } from '../../components/Toast'
import { formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

export default function TripCompleteScreen({ trip, onSave }) {
  const { toast } = useToast()
  const { rateTrip } = useTrip()
  const [rating, setRating] = useState(0)
  const [saving, setSaving] = useState(false)

  // Every figure here is the server's frozen record of the completed trip.
  const stats = [
    { label: 'Fare paid', value: formatINR(trip.fare), alert: false },
    { label: 'Distance', value: `${Number(trip.distanceKm).toFixed(1)} km`, alert: false },
    {
      label: 'Duration',
      value: trip.durationMin ? `${trip.durationMin} min` : '—',
      alert: false,
    },
    { label: 'Ceiling', value: `${trip.ceiling} km/h`, alert: false },
  ]

  const finish = async () => {
    setSaving(true)
    try {
      if (rating > 0) await rateTrip(rating)
    } catch {
      // A rating failure must not trap the user on this screen.
    }
    await onSave()
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.lg }}>
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
        <Text style={{ ...type.headline, color: colors.text, marginTop: space.md }}>You have arrived</Text>
        <Text style={{ ...type.tiny, color: colors.textMuted }}>
          Trip {trip.id} · sealed into your Trip Vault
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
      >
        <View
          style={{
            height: 140,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          <MapCanvas progress={100} style={{ width: '100%', height: '100%' }} />
        </View>

        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {stats.map((s) => (
              <View key={s.label} style={{ width: '50%', paddingVertical: 6 }}>
                <Text style={{ ...type.tiny, color: colors.textMuted }}>{s.label}</Text>
                <Text style={{ ...type.bodyBold, color: s.alert ? colors.red : colors.text }}>
                  {s.value}
                  {s.sub ? <Text style={{ ...type.micro, color: colors.textMuted }}> {s.sub}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={{ alignItems: 'center' }}>
          <Text style={{ ...type.caption, color: colors.textMuted }}>How was {trip.driver.name}?</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Driver rating"
            style={{ flexDirection: 'row', gap: 6, marginTop: space.sm }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ checked: rating === n }}
                accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                onPress={() => setRating(n)}
                style={{ padding: 4 }}
              >
                <Star
                  size={28}
                  color={n <= rating ? colors.red : colors.borderStrong}
                  fill={n <= rating ? colors.red : 'transparent'}
                />
              </Pressable>
            ))}
          </View>
        </Card>
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
          gap: space.sm,
        }}
      >
        <Button
          label={saving ? 'Saving…' : rating === 0 ? 'Rate your driver to finish' : 'Submit & finish'}
          icon={Archive}
          disabled={rating === 0 || saving}
          onPress={finish}
        />
        <Button
          label="Email me the receipt"
          variant="ghost"
          onPress={() => toast('Receipt sent to your email (demo)', 'info')}
        />
      </View>
    </SafeAreaView>
  )
}
