import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Archive, BadgeCheck, Download } from 'lucide-react-native'
import BottomSheet from '../../components/BottomSheet'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import { useTrip } from '../../context/TripContext'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/apiClient'
import { formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

const ZONE_LABEL = { FRONT: 'Front', REAR: 'Rear', LEFT: 'Left', RIGHT: 'Right', DASHBOARD: 'Dash', SEATS: 'Seats', FUEL_ODOMETER: 'Fuel', BOOT: 'Boot' }

function TripDetail({ trip }) {
  const { toast } = useToast()
  const [photos, setPhotos] = useState(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    api.trips.vaultPhotos(trip.serverId).then(setPhotos).catch(() => setPhotos([]))
  }, [trip.serverId])

  const openCertificate = async () => {
    setOpening(true)
    try {
      const cert = await api.trips.certificate(trip.serverId)
      await WebBrowser.openBrowserAsync(cert.url)
    } catch (err) {
      toast(err?.message ?? 'Could not open the certificate', 'warning')
    } finally {
      setOpening(false)
    }
  }
  const stats = [
    { label: 'Distance', value: `${Number(trip.distanceKm).toFixed(1)} km`, alert: false },
    { label: 'Ceiling', value: `${trip.ceiling} km/h`, alert: false },
    { label: 'Duration', value: trip.durationMin ? `${trip.durationMin} min` : '—', alert: false },
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
          Driver {trip.driverName} · {formatINR(trip.fare)}
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
          PRE-TRIP INSPECTION
        </Text>
        {photos === null ? (
          <ActivityIndicator color={colors.red} />
        ) : photos.length === 0 ? (
          <Text style={{ ...type.tiny, color: colors.textMuted }}>No inspection photos were recorded for this trip.</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {photos.map((p) => (
              <View key={`${p.phase}-${p.zone}`} style={{ width: '22.5%', gap: 4 }}>
                <Image
                  source={{ uri: p.url }}
                  accessibilityLabel={`${ZONE_LABEL[p.zone] ?? p.zone} photo`}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }}
                />
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textAlign: 'center' }}>
                  {ZONE_LABEL[p.zone] ?? p.zone}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 6 }}>
          Watermarked with time and place, and sealed with a SHA-256 fingerprint.
        </Text>
      </View>

      <Card tone="alert">
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <BadgeCheck size={20} color={colors.red} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...type.bodyBold, color: colors.text }}>Trip certificate</Text>
            <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
              A signed PDF record of this trip, its route and its inspection
            </Text>
          </View>
        </View>
        <Button
          label={opening ? 'Preparing…' : 'Open PDF certificate'}
          icon={Download}
          disabled={opening}
          onPress={openCertificate}
          style={{ marginTop: space.md }}
        />
      </Card>
    </View>
  )
}

export default function VaultScreen() {
  const { vaultTrips: trips } = useTrip()
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
        {trips.length === 0 && (
          <Card>
            <View style={{ alignItems: 'center', gap: space.xs, paddingVertical: space.xl }}>
              <Archive size={26} color={colors.textFaint} />
              <Text style={{ ...type.body, color: colors.text }}>No sealed trips yet</Text>
              <Text style={{ ...type.tiny, color: colors.textMuted, textAlign: 'center' }}>
                Complete a ride and its route, telematics and fare are archived here.
              </Text>
            </View>
          </Card>
        )}
        {trips.map((trip) => {
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
                  <Pill label="Sealed" tone="safe" />
                </View>
                <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted, marginTop: 4 }}>
                  {trip.date}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
                  <Pill label={trip.skill} />
                  <Pill label={`${Number(trip.distanceKm).toFixed(1)} km`} />
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
