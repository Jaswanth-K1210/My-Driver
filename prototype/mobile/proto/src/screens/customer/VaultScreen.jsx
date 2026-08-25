import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Archive, BadgeCheck, Download, ShieldCheck } from 'lucide-react-native'
import BottomSheet from '../../components/BottomSheet'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
import { VISION_MODES } from '../../data/mock'
import { formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

const ZONES = ['Front', 'Rear', 'Left', 'Right', 'Dash', 'Seats', 'Fuel', 'Boot']

function TripDetail({ trip }) {
  const { toast } = useToast()
  const mode = VISION_MODES.find((m) => m.id === trip.visionMode)

  const stats = [
    { label: 'Max speed', value: `${trip.maxSpeed} km/h`, alert: trip.maxSpeed > trip.ceiling },
    { label: 'Ceiling', value: `${trip.ceiling} km/h`, alert: false },
    { label: 'Breaches', value: String(trip.breaches), alert: trip.breaches > 0 },
  ]

  return (
    <View style={{ gap: space.lg }}>
      <Card tone="sunken">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...type.caption, color: colors.text }}>{trip.date}</Text>
          <Pill label={trip.skill} tone="brand" />
        </View>
        <Text style={{ ...type.body, color: colors.text, marginTop: space.sm }}>
          {trip.from} → {trip.to}
        </Text>
        <Text style={{ ...type.tiny, color: colors.textMuted }}>
          Driver {trip.driver} · {formatINR(trip.fare)}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {stats.map((s) => (
          <Card key={s.label} tone="sunken" style={{ flex: 1, alignItems: 'center', padding: space.md }}>
            <Text style={{ ...type.bodyBold, color: s.alert ? colors.red : colors.text }}>{s.value}</Text>
            <Text style={{ ...type.micro, color: colors.textMuted, marginTop: 2 }}>{s.label}</Text>
          </Card>
        ))}
      </View>

      <View>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6, marginBottom: space.sm }}>
          8-POINT INSPECTION
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {ZONES.map((zone) => (
            <View
              key={zone}
              style={{
                width: '22%',
                alignItems: 'center',
                gap: 4,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
                padding: space.sm,
              }}
            >
              <View
                style={{
                  width: '100%',
                  height: 34,
                  borderRadius: 6,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={16} color={colors.graphite} />
              </View>
              <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted }}>{zone}</Text>
            </View>
          ))}
        </View>
        <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 6 }}>
          Pre {trip.preInspection} · Post {trip.postInspection} · watermarked & immutable
        </Text>
      </View>

      <Card tone="alert">
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <BadgeCheck size={20} color={colors.red} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...type.bodyBold, color: colors.text }}>Trip certificate</Text>
            <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
              Cert {trip.certId} · Mode {mode ? `${mode.id} (${mode.name})` : trip.visionMode}
            </Text>
          </View>
        </View>
        <Button
          label="Export PDF certificate"
          icon={Download}
          onPress={() => toast('Certificate exported to downloads (demo)', 'success')}
          style={{ marginTop: space.md }}
        />
      </Card>
    </View>
  )
}

export default function VaultScreen({ trips }) {
  const [detailTrip, setDetailTrip] = useState(null)

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Archive size={20} color={colors.red} />
          <Text style={{ ...type.headline, color: colors.text }}>Trip Vault</Text>
        </View>
        <Text style={{ ...type.tiny, color: colors.textMuted }}>
          {trips.length} sealed trips · tamper-proof archive
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: 10 }}
      >
        {trips.map((trip) => {
          const breached = trip.breaches > 0
          return (
            <Pressable key={trip.id} accessibilityRole="button" onPress={() => setDetailTrip(trip)}>
              <Card>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: space.sm,
                  }}
                >
                  <Text numberOfLines={1} style={{ ...type.body, color: colors.text, flex: 1 }}>
                    {trip.from} → {trip.to}
                  </Text>
                  <Pill
                    label={breached ? `${trip.breaches} breach` : 'Clean'}
                    tone={breached ? 'brand' : 'safe'}
                  />
                </View>
                <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted, marginTop: 4 }}>
                  {trip.date}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
                  <Pill label={trip.skill} />
                  <Pill label={`Mode ${trip.visionMode}`} />
                  <Text style={{ ...type.caption, color: colors.text, marginLeft: 'auto' }}>
                    {formatINR(trip.fare)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          )
        })}
      </ScrollView>

      <BottomSheet
        open={Boolean(detailTrip)}
        onClose={() => setDetailTrip(null)}
        title="Sealed trip record"
      >
        {detailTrip ? <TripDetail trip={detailTrip} /> : null}
      </BottomSheet>
    </SafeAreaView>
  )
}
