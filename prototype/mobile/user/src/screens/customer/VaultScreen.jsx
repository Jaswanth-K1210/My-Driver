import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Share, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Archive, BadgeCheck, Download, Receipt, RefreshCw, Share2, WifiOff } from 'lucide-react-native'
import BottomSheet from '../../components/BottomSheet'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import { useTrip } from '../../context/TripContext'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/apiClient'
import { paymentLabel, receiptLines, receiptText } from '../../lib/tripView'
import { formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

const ZONE_LABEL = { FRONT: 'Front', REAR: 'Rear', LEFT: 'Left', RIGHT: 'Right', DASHBOARD: 'Dash', SEATS: 'Seats', FUEL_ODOMETER: 'Fuel', BOOT: 'Boot' }
const PHASE_LABEL = { PRE: 'Before the trip', POST: 'After the trip' }

function SectionLabel({ children }) {
  return (
    <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6, marginBottom: space.sm }}>
      {String(children).toUpperCase()}
    </Text>
  )
}

/** The money for one trip, from the server's payment record. */
function ReceiptCard({ trip }) {
  const { toast } = useToast()
  // undefined while loading, null when there is no payment, false on failure.
  const [payment, setPayment] = useState(undefined)

  const load = useCallback(() => {
    setPayment(undefined)
    api.payments
      .forTrip(trip.serverId)
      .then((r) => setPayment(r.payment ?? null))
      .catch(() => setPayment(false))
  }, [trip.serverId])

  useEffect(load, [load])

  // The same hosted checkout page as the completion screen; with money owed
  // it collects the difference. Reload afterwards to show the result.
  const payDue = async () => {
    await WebBrowser.openBrowserAsync(api.payments.checkoutUrl(payment), {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: colors.red,
    })
    load()
  }

  const share = async () => {
    try {
      await Share.share({ message: receiptText(trip, payment || null) })
    } catch {
      toast('Could not open the share sheet', 'warning')
    }
  }

  return (
    <View>
      <SectionLabel>Receipt</SectionLabel>
      <Card tone="sunken" style={{ gap: space.sm }}>
        {payment === undefined ? (
          <ActivityIndicator color={colors.red} />
        ) : payment === false ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ ...type.caption, color: colors.textMuted }}>
              Could not load the payment for this trip. Check your connection.
            </Text>
            <Button label="Try again" icon={RefreshCw} variant="subtle" onPress={load} />
          </View>
        ) : (
          <>
            {receiptLines(trip, payment).map((line) => (
              <View key={line.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                <Text style={{ ...type.caption, color: line.alert ? colors.redPressed : colors.textMuted }}>
                  {line.label}
                </Text>
                <Text style={{ ...type.bodyBold, color: line.alert ? colors.redPressed : colors.text }}>
                  {line.value}
                </Text>
              </View>
            ))}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: space.md,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: space.sm,
              }}
            >
              <Text style={{ ...type.caption, color: colors.textMuted }}>Payment</Text>
              <Text style={{ ...type.caption, color: colors.text, flexShrink: 1, textAlign: 'right' }}>
                {paymentLabel(payment)}
              </Text>
            </View>
            {payment?.provider_payment_id ? (
              <Text selectable style={{ ...type.tiny, color: colors.textMuted }}>
                Reference {payment.provider_payment_id}
              </Text>
            ) : null}
            {payment?.amount_due > 0 ? (
              <>
                <Text style={{ ...type.caption, color: colors.redPressed, lineHeight: 18 }}>
                  The final fare was more than the amount held at booking.
                </Text>
                <Button label={`Pay ${formatINR(payment.amount_due)}`} onPress={payDue} />
              </>
            ) : null}
            <Button label="Share receipt" icon={Share2} variant="outline" onPress={share} />
          </>
        )}
      </Card>
    </View>
  )
}

/** Inspection photos and the certificate. Only a completed trip has them. */
function SealedRecord({ trip }) {
  const { toast } = useToast()
  // null while loading, false on failure.
  const [photos, setPhotos] = useState(null)
  const [opening, setOpening] = useState(false)

  const load = useCallback(() => {
    setPhotos(null)
    api.trips.vaultPhotos(trip.serverId).then(setPhotos).catch(() => setPhotos(false))
  }, [trip.serverId])

  useEffect(load, [load])

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

  const phases = photos ? [...new Set(photos.map((p) => p.phase))] : []

  return (
    <>
      <View>
        <SectionLabel>Car inspection</SectionLabel>
        {photos === null ? (
          <ActivityIndicator color={colors.red} />
        ) : photos === false ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ ...type.caption, color: colors.textMuted }}>Could not load the inspection photos.</Text>
            <Button label="Try again" icon={RefreshCw} variant="subtle" onPress={load} />
          </View>
        ) : photos.length === 0 ? (
          <Text style={{ ...type.caption, color: colors.textMuted }}>
            No inspection photos were recorded for this trip.
          </Text>
        ) : (
          <View style={{ gap: space.md }}>
            {phases.map((phase) => (
              <View key={phase}>
                <Text style={{ ...type.caption, color: colors.text, marginBottom: 6 }}>
                  {PHASE_LABEL[phase] ?? phase}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {photos
                    .filter((p) => p.phase === phase)
                    .map((p) => (
                      <View key={`${p.phase}-${p.zone}`} style={{ width: '22.5%', gap: 4 }}>
                        <Image
                          source={{ uri: p.url }}
                          accessibilityLabel={`${ZONE_LABEL[p.zone] ?? p.zone} photo, ${PHASE_LABEL[p.phase] ?? p.phase}`}
                          style={{ width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }}
                        />
                        <Text style={{ ...type.micro, color: colors.textMuted, textAlign: 'center' }}>
                          {ZONE_LABEL[p.zone] ?? p.zone}
                        </Text>
                      </View>
                    ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <Card tone="alert">
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <BadgeCheck size={20} color={colors.red} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...type.bodyBold, color: colors.text }}>Trip certificate</Text>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>
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
    </>
  )
}

function TripDetail({ trip }) {
  const completed = trip.status === 'COMPLETED'
  const stats = completed
    ? [
        { label: 'Distance', value: `${Number(trip.distanceKm).toFixed(1)} km` },
        { label: 'Speed limit', value: `${trip.ceiling} km/h` },
        { label: 'Duration', value: trip.durationMin ? `${trip.durationMin} min` : 'Not recorded' },
      ]
    : []

  return (
    <View style={{ gap: space.lg }}>
      <Card tone="sunken">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <Text style={{ ...type.caption, color: colors.text, flex: 1 }}>{trip.date}</Text>
          <Pill label={trip.historyLabel} tone={completed ? 'safe' : 'neutral'} />
        </View>
        <Text style={{ ...type.body, color: colors.text, marginTop: space.sm }}>
          {trip.from} → {trip.to}
        </Text>
        <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 2 }}>
          {[`Trip ${trip.id}`, trip.skill, trip.driverName ? `Driver ${trip.driverName}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Card>

      {stats.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {stats.map((s) => (
            <Card key={s.label} tone="sunken" style={{ flex: 1, alignItems: 'center', padding: space.md }}>
              <Text style={{ ...type.bodyBold, color: colors.text }}>{s.value}</Text>
              <Text style={{ ...type.micro, color: colors.textMuted, marginTop: 2 }}>{s.label}</Text>
            </Card>
          ))}
        </View>
      ) : null}

      <ReceiptCard trip={trip} />

      {completed ? <SealedRecord trip={trip} /> : null}
    </View>
  )
}

function TripRow({ trip, onPress }) {
  const completed = trip.status === 'COMPLETED'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trip.from} to ${trip.to}, ${trip.date}, ${trip.historyLabel}, ${formatINR(trip.fare)}`}
      accessibilityHint="Opens the receipt"
      onPress={onPress}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <Text numberOfLines={1} style={{ ...type.body, color: colors.text, flex: 1 }}>
            {trip.from} → {trip.to}
          </Text>
          <Pill label={trip.historyLabel} tone={completed ? 'safe' : 'neutral'} />
        </View>
        <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted, marginTop: 4 }}>
          {trip.date}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
          <Pill label={trip.skill} />
          {completed ? <Pill label={`${Number(trip.distanceKm).toFixed(1)} km`} /> : null}
          <Text style={{ ...type.caption, color: colors.text, marginLeft: 'auto' }}>
            {trip.fareIsFinal ? formatINR(trip.fare) : `Est. ${formatINR(trip.fare)}`}
          </Text>
        </View>
      </Card>
    </Pressable>
  )
}

export default function VaultScreen() {
  const { history, historyStatus, hasMoreHistory, historyLoadingMore, loadMoreHistory, reloadHistory } = useTrip()
  const { toast } = useToast()
  const [detailTrip, setDetailTrip] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      await reloadHistory()
    } catch {
      toast('Could not refresh your trips. Check your connection.', 'warning')
    } finally {
      setRefreshing(false)
    }
  }

  const loadMore = () => {
    loadMoreHistory().catch(() => toast('Could not load more trips', 'warning'))
  }

  const empty =
    historyStatus === 'loading' ? (
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl }}>
        <ActivityIndicator color={colors.red} />
        <Text style={{ ...type.caption, color: colors.textMuted }}>Loading your trips</Text>
      </View>
    ) : historyStatus === 'error' ? (
      <Card>
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
          <WifiOff size={26} color={colors.textMuted} />
          <Text style={{ ...type.body, color: colors.text }}>Could not load your trips</Text>
          <Text style={{ ...type.caption, color: colors.textMuted, textAlign: 'center' }}>
            Check your connection and try again.
          </Text>
          <Button label="Try again" icon={RefreshCw} variant="subtle" onPress={refresh} />
        </View>
      </Card>
    ) : (
      <Card>
        <View style={{ alignItems: 'center', gap: space.xs, paddingVertical: space.xl }}>
          <Archive size={26} color={colors.textMuted} />
          <Text style={{ ...type.body, color: colors.text }}>No trips yet</Text>
          <Text style={{ ...type.caption, color: colors.textMuted, textAlign: 'center' }}>
            Your trips appear here with their receipts. A completed trip also keeps its inspection photos and
            certificate.
          </Text>
        </View>
      </Card>
    )

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Receipt size={20} color={colors.red} />
          <Text accessibilityRole="header" style={{ ...type.headline, color: colors.text }}>
            Your trips
          </Text>
        </View>
        <Text style={{ ...type.caption, color: colors.textMuted }}>Receipts, inspection photos and certificates</Text>
      </View>

      <FlatList
        data={history}
        keyExtractor={(trip) => trip.serverId}
        renderItem={({ item }) => <TripRow trip={item} onPress={() => setDetailTrip(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={empty}
        ListFooterComponent={
          hasMoreHistory ? (
            <Button
              label={historyLoadingMore ? 'Loading…' : 'Show older trips'}
              variant="subtle"
              disabled={historyLoadingMore}
              onPress={loadMore}
              style={{ marginTop: space.md }}
            />
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.red} colors={[colors.red]} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
      />

      <BottomSheet open={Boolean(detailTrip)} onClose={() => setDetailTrip(null)} title="Trip receipt">
        {detailTrip ? <TripDetail trip={detailTrip} /> : null}
      </BottomSheet>
    </SafeAreaView>
  )
}
