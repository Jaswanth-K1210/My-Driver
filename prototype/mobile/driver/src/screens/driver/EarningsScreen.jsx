import { Text, View } from 'react-native'
import { Pill } from '../../components/Button'
import Card from '../../components/Card'
import Screen, { Empty, SectionLabel, useLoad } from '../../components/Screen'
import { api } from '../../lib/apiClient'
import { formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

const fetchEarnings = () => api.driver.earnings()

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Dates arrive as YYYY-MM-DD in IST; parse the parts so no timezone shifts them. */
const parts = (dateOnly) => dateOnly.split('-').map(Number)
const weekday = (dateOnly) => {
  const [y, m, d] = parts(dateOnly)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (dateOnly) => {
  const [, m, d] = parts(dateOnly)
  return `${d} ${MONTHS[m - 1]}`
}
const whenCompleted = (iso) => {
  if (!iso) return ''
  const at = new Date(iso)
  return `${at.getDate()} ${MONTHS[at.getMonth()]} · ${at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
}

const shortTripId = (id) => `TRP-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`

const PAYOUT_LABEL = {
  PENDING: 'Settlement in progress',
  APPROVED: 'Approved for payout',
  PAID: 'Paid out',
  FAILED: 'Payout failed',
}
/** Red is reserved for what needs attention; a paid payout reads as safe. */
const payoutTone = (status) => (status === 'FAILED' ? 'brand' : status === 'PAID' ? 'safe' : 'neutral')

const requirementLabel = (req, tripType) => {
  const base =
    req === 'inter_city'
      ? 'Outstation'
      : req === 'airport'
        ? 'Airport'
        : req === 'full_time'
          ? 'Contract'
          : req === 'within_city'
            ? 'Within city'
            : null
  const suffix = tripType === 'two_way' ? 'Round-trip' : null
  return [base, suffix].filter(Boolean).join(' · ')
}

function BreakdownRow({ label, value, bold = false, accent = false, muted = false }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text
        style={{
          ...(bold ? type.caption : type.tiny),
          fontWeight: bold ? '700' : '400',
          color: muted ? colors.textMuted : colors.text,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          ...(bold ? type.bodyBold : type.caption),
          color: accent ? colors.red : muted ? colors.textMuted : colors.text,
        }}
      >
        {value}
      </Text>
    </View>
  )
}

function TripEarningsCard({ t }) {
  const fareAmount = Number(t.fare_amount ?? 0)
  const driverEarnings = Number(t.driver_earnings ?? 0)
  const platformFee =
    t.platform_fee != null ? Number(t.platform_fee) : Math.max(0, Math.round((fareAmount - driverEarnings) * 100) / 100)
  const nightFee = Number(t.night_fee ?? 0)
  const baseFare =
    t.base_fare != null
      ? Number(t.base_fare)
      : Math.max(0, Math.round((fareAmount - platformFee - nightFee) * 100) / 100)
  const reqText = requirementLabel(t.requirement, t.trip_type)
  // The customer cancelled after this driver reached the pickup.
  const fined = Number(t.cancellation_fee ?? 0) > 0
  const distanceLabel =
    t.booking_type === 'HOURLY' && t.hourly_package_hours
      ? `${t.hourly_package_hours} hr package`
      : t.distance_km != null
        ? `${Number(t.distance_km.toFixed(1))} km`
        : null

  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pill label={shortTripId(t.trip_id)} tone="neutral" />
          {t.required_certification ? <Pill label={t.required_certification} tone="neutral" /> : null}
          {reqText ? <Pill label={reqText} tone="neutral" /> : null}
          {fined ? <Pill label="Cancellation fee" tone="brand" /> : null}
        </View>
        <Pill
          label={t.payout_status ? (PAYOUT_LABEL[t.payout_status] ?? t.payout_status) : 'Unsettled'}
          tone={t.payout_status ? payoutTone(t.payout_status) : 'neutral'}
        />
      </View>

      <Text style={{ ...type.micro, color: colors.textMuted }}>
        {whenCompleted(t.completed_at)}
        {t.customer_name ? ` · Customer: ${t.customer_name}` : ''}
        {distanceLabel ? ` · ${distanceLabel}` : ''}
        {t.duration_min != null ? ` · ${t.duration_min} min` : ''}
      </Text>

      <View style={{ gap: 6, marginTop: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: radius.pill,
              backgroundColor: colors.graphite,
              marginTop: 5,
            }}
          />
          <Text style={{ ...type.tiny, color: colors.text, flex: 1 }}>
            {t.pickup_address ?? 'Pickup location'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: radius.pill,
              backgroundColor: colors.red,
              marginTop: 5,
            }}
          />
          <Text style={{ ...type.tiny, color: colors.text, flex: 1 }}>
            {t.drop_address ?? 'Drop location'}
          </Text>
        </View>
      </View>

      <View
        style={{
          marginTop: space.xs,
          padding: space.sm,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceAlt,
          gap: 2,
        }}
      >
        <BreakdownRow
          label={fined ? 'Customer cancelled at pickup (paid to you in full)' : `Base trip fare${distanceLabel ? ` (${distanceLabel})` : ''}`}
          value={formatINR(baseFare)}
        />
        {nightFee > 0 && (
          <BreakdownRow label="Night allowance (10 PM – 5 AM)" value={`+${formatINR(nightFee)}`} />
        )}
        <BreakdownRow label="Platform fee (collected from customer)" value={`+${formatINR(platformFee)}`} muted />
        <BreakdownRow label="Customer total fare" value={formatINR(fareAmount)} />
        <BreakdownRow label="Less: MyDriver platform fee" value={`−${formatINR(platformFee)}`} muted />
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            marginTop: 4,
            paddingTop: 6,
          }}
        >
          <BreakdownRow label="Your net earnings" value={formatINR(driverEarnings)} bold accent />
        </View>
      </View>
    </Card>
  )
}

function Total({ label, total }) {
  return (
    <Card style={{ flex: 1, padding: space.md }}>
      <Text style={{ ...type.micro, color: colors.textMuted }}>{label}</Text>
      <Text style={{ ...type.title, color: colors.text, marginTop: 2 }}>{formatINR(total.earnings)}</Text>
      <Text style={{ ...type.micro, color: colors.textMuted }}>
        {total.trips} trip{total.trips === 1 ? '' : 's'}
      </Text>
    </Card>
  )
}

function WeekBars({ daily }) {
  const peak = Math.max(1, ...daily.map((d) => d.earnings))
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, height: 96 }}>
        {daily.map((day, i) => (
          <View
            key={day.date}
            accessible
            accessibilityLabel={`${weekday(day.date)} ${shortDate(day.date)}: ${formatINR(day.earnings)} from ${day.trips} trips`}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}
          >
            <View
              style={{
                width: '100%',
                height: `${Math.max(3, (day.earnings / peak) * 100)}%`,
                borderRadius: radius.sm,
                // Today is the last bar.
                backgroundColor: i === daily.length - 1 ? colors.red : colors.borderStrong,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
        {daily.map((day) => (
          <Text key={day.date} style={{ flex: 1, textAlign: 'center', ...type.micro, color: colors.textMuted }}>
            {weekday(day.date)}
          </Text>
        ))}
      </View>
    </Card>
  )
}

export default function EarningsScreen() {
  const load = useLoad(fetchEarnings)
  return (
    <Screen title="Earnings" subtitle="Your net share after the ₹19 platform fee" load={load}>
      {(e) => {
        const pendingPayouts = (e.payouts ?? []).filter(
          (p) => p.status === 'PENDING' || p.status === 'APPROVED',
        )
        const pendingPayoutNet = pendingPayouts.reduce((sum, p) => sum + Number(p.net ?? 0), 0)
        const pendingPayoutTrips = pendingPayouts.reduce((sum, p) => sum + Number(p.trip_count ?? 0), 0)
        const totalAwaitingBank = Number(e.unsettled?.earnings ?? 0) + pendingPayoutNet
        const totalAwaitingTrips = Number(e.unsettled?.trips ?? 0) + pendingPayoutTrips

        return (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Total label="Today (net)" total={e.today} />
              <Total label="This week (net)" total={e.this_week} />
            </View>

            <Card tone="sunken">
              <Text style={{ ...type.micro, color: colors.textMuted }}>AWAITING BANK PAYOUT</Text>
              <Text style={{ ...type.display, color: colors.text }}>{formatINR(totalAwaitingBank)}</Text>
              <Text style={{ ...type.tiny, color: colors.textMuted }}>
                {totalAwaitingTrips} completed trip{totalAwaitingTrips === 1 ? '' : 's'}
                {pendingPayoutNet > 0
                  ? ` (${formatINR(pendingPayoutNet)} in active settlement · ${formatINR(e.unsettled.earnings)} unsettled)`
                  : ' waiting for the next weekly settlement'}
              </Text>
            </Card>

            <SectionLabel>Last 7 days</SectionLabel>
            <WeekBars daily={e.daily} />

            <SectionLabel>Trip earnings breakdown ({e.trips.length})</SectionLabel>
            {e.trips.length === 0 ? (
              <Card>
                <Empty>Completed trips and their full fare breakdown appear here.</Empty>
              </Card>
            ) : (
              <View style={{ gap: space.md }}>
                {e.trips.map((t) => (
                  <TripEarningsCard key={t.trip_id} t={t} />
                ))}
              </View>
            )}

            <SectionLabel>Weekly payouts</SectionLabel>
            <Card style={{ gap: space.md }}>
              {e.payouts.length === 0 && <Empty>No payouts generated yet. Settlements run weekly.</Empty>}
              {e.payouts.map((p) => (
                <View
                  key={p.id}
                  style={{
                    gap: 6,
                    paddingBottom: space.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={{ ...type.bodyBold, color: colors.text }}>
                        {shortDate(p.period_start)} – {shortDate(p.period_end)}
                      </Text>
                      <Text style={{ ...type.micro, color: colors.textMuted }}>
                        {p.trip_count} trip{p.trip_count === 1 ? '' : 's'}
                        {p.reference ? ` · Ref ${p.reference}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={{ ...type.bodyBold, color: colors.text }}>{formatINR(p.net)}</Text>
                      <Pill label={PAYOUT_LABEL[p.status] ?? p.status} tone={payoutTone(p.status)} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ ...type.micro, color: colors.textMuted }}>
                      Customer fares: {formatINR(p.gross)} · Platform fee: −{formatINR(p.platform_fee)}
                    </Text>
                    <Text style={{ ...type.micro, color: colors.text, fontWeight: '600' }}>
                      Net: {formatINR(p.net)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )
      }}
    </Screen>
  )
}
