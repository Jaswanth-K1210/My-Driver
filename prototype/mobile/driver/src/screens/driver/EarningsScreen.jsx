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

const PAYOUT_LABEL = { PENDING: 'Being prepared', APPROVED: 'Approved', PAID: 'Paid', FAILED: 'Failed' }
/** Red is reserved for what needs attention; a paid payout reads as graphite. */
const payoutTone = (status) => (status === 'FAILED' ? 'brand' : status === 'PAID' ? 'safe' : 'neutral')

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
    <Screen title="Earnings" subtitle="Your share after the platform fee" load={load}>
      {(e) => (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Total label="Today" total={e.today} />
            <Total label="This week" total={e.this_week} />
          </View>

          <Card tone="sunken">
            <Text style={{ ...type.micro, color: colors.textMuted }}>NOT YET PAID OUT</Text>
            <Text style={{ ...type.display, color: colors.text }}>{formatINR(e.unsettled.earnings)}</Text>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>
              {e.unsettled.trips} trip{e.unsettled.trips === 1 ? '' : 's'} waiting for the next weekly settlement
            </Text>
          </Card>

          <SectionLabel>Last 7 days</SectionLabel>
          <WeekBars daily={e.daily} />

          <SectionLabel>Payouts</SectionLabel>
          <Card style={{ gap: space.md }}>
            {e.payouts.length === 0 && <Empty>No payouts yet. Settlements are made weekly.</Empty>}
            {e.payouts.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...type.body, color: colors.text }}>
                    {shortDate(p.period_start)} – {shortDate(p.period_end)}
                  </Text>
                  <Text style={{ ...type.micro, color: colors.textMuted }}>
                    {p.trip_count} trip{p.trip_count === 1 ? '' : 's'} · fee {formatINR(p.platform_fee)}
                    {p.reference ? ` · ref ${p.reference}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={{ ...type.bodyBold, color: colors.text }}>{formatINR(p.net)}</Text>
                  <Pill label={PAYOUT_LABEL[p.status] ?? p.status} tone={payoutTone(p.status)} />
                </View>
              </View>
            ))}
          </Card>

          <SectionLabel>Trips</SectionLabel>
          <Card style={{ gap: space.md }}>
            {e.trips.length === 0 && <Empty>Completed trips appear here.</Empty>}
            {e.trips.map((t) => (
              <View key={t.trip_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ ...type.caption, color: colors.text }}>
                    {t.drop_address ?? t.pickup_address ?? 'Trip'}
                  </Text>
                  <Text style={{ ...type.micro, color: colors.textMuted }}>
                    {whenCompleted(t.completed_at)}
                    {t.fare_amount != null ? ` · fare ${formatINR(t.fare_amount)}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={{ ...type.bodyBold, color: colors.text }}>{formatINR(t.driver_earnings ?? 0)}</Text>
                  <Text style={{ ...type.micro, color: colors.textMuted }}>
                    {t.payout_status ? PAYOUT_LABEL[t.payout_status] : 'Not yet paid out'}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  )
}
