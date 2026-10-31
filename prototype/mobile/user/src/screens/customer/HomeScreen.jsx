/**
 * HomeScreen — the complete booking UI for the MyDriver user app.
 *
 * Sections (in scroll order):
 *   What do you need?   — RequirementTabs
 *   Your vehicle        — CarDetailsForm (saved garage + another car)
 *   Trip details        — WithinCityForm / InterCityForm / AirportForm / FullTimeForm
 *   Your driver         — the tier the server picks from the car
 *   Safety              — speed limit, guardians, female driver;
 *                         asked once, then pre-filled from /v1/me
 *   Price estimate      — server total, with the line breakdown on demand
 *
 * Sticky bar: estimated total + "Find [Tier] Driver" — disabled until quote.ready
 */
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Slider from '@react-native-community/slider'
import { ChevronDown, ChevronUp, Gauge, Search, UserCheck } from 'lucide-react-native'
import { useTrip } from '../../context/TripContext'
import { useAuth } from '../../context/AuthContext'
import { useEffect, useState } from 'react'
import { bookingPayloadFor, quoteFor, serverQuote } from '../../lib/booking'
import { api } from '../../lib/apiClient'
import { requirementEnabled } from '../../lib/features'
import { clamp, formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'
import Button from '../../components/Button'
import { Panel } from '../../components/Form'
import Toggle from '../../components/Toggle'

import RequirementTabs from './components/RequirementTabs'
import CarDetailsForm from './components/CarDetailsForm'
import WithinCityForm from './components/WithinCityForm'
import InterCityForm from './components/InterCityForm'
import AirportForm from './components/AirportForm'
import FullTimeForm from './components/FullTimeForm'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const TRIP_TITLES = {
  within_city: 'Route & duration',
  inter_city: 'Outstation trip',
  airport: 'Airport transfer',
  full_time: 'Contract details',
}

function Section({ title, hint, children }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={{ ...type.title, color: colors.text }}>
          {title}
        </Text>
        {hint ? <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 17 }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  )
}

/* ── Main Component ──────────────────────────────────────────────────────── */

export default function HomeScreen({ config, onChange, onFindDriver }) {
  const { skills, skillsStatus, reloadSkills } = useTrip()
  const { user, refreshMe } = useAuth()
  const safety = user?.safety
  const firstTime = safety ? !safety.set : false
  const [saving, setSaving] = useState(false)

  // Saved defaults pre-fill every booking; changing them here is for this
  // trip only (the Profile screen changes the defaults).
  useEffect(() => {
    if (!safety?.set) return
    onChange({
      ...config,
      ceiling: safety.speed_limit_kmh,
      shareWithGuardians: safety.share_with_guardians,
      preferFemaleDriver: safety.prefer_female_driver,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safety?.set])

  // The price shown, and held at checkout, is the server's. The local quote
  // only supplies the words (route, trip type, duration) and tells us the
  // form is complete enough to ask for a price.
  const [server, setServer] = useState(null)
  const [priceStatus, setPriceStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const [priceAttempt, setPriceAttempt] = useState(0)
  const [showFare, setShowFare] = useState(false)

  const local = quoteFor(config, skills)

  useEffect(() => {
    if (!local.ready) {
      setServer(null)
      setPriceStatus('idle')
      return undefined
    }
    let cancelled = false
    setPriceStatus('loading')
    const timer = setTimeout(() => {
      serverQuote(api, config).then((q) => {
        if (cancelled) return
        // serverQuote resolves to null when the request failed. A price from
        // an earlier form state must not stay on screen as if it were current.
        setServer(q)
        setPriceStatus(q ? 'ready' : 'error')
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [config, skills, local.ready, priceAttempt])

  const priced = priceStatus === 'ready' && server
  // The server picks the tier from the car and the hour; show what it chose.
  const tier = priced
    ? { label: server.tier_label, ...skills.find((s) => s.id === server.required_certification) }
    : null
  const quote = {
    skill: tier,
    ready: Boolean(priced),
    total: priced ? server.fare.total : 0,
    lines: [
      // Words only from the local quote: its rupee figures are not the server's.
      ...local.lines.filter((l) => !String(l.value).includes('₹') && !/distance/i.test(l.label)),
      ...(priced
        ? [
            ...(server.distance_km > 0 ? [{ label: 'Distance', value: `${server.distance_km.toFixed(1)} km` }] : []),
            { label: `${server.tier_label} fare`, value: formatINR(server.fare.base - (server.fare.stops_fee ?? 0)) },
            ...(server.fare.stops_fee > 0 ? [{ label: 'Stops', value: formatINR(server.fare.stops_fee) }] : []),
            { label: 'Platform fee', value: formatINR(server.fare.platform_fee) },
            ...(server.fare.night_fee > 0 ? [{ label: 'Night fee', value: formatINR(server.fare.night_fee) }] : []),
          ]
        : []),
    ],
  }

  // First booking: the choices made here become the saved defaults.
  const findDriver = async () => {
    if (config.tripType === 'two_way') {
      const payload = bookingPayloadFor(config)
      if (!payload.return_drop) {
        Alert.alert(
          'Return Drop Required',
          'Please select a valid final return destination for your round trip.',
        )
        return
      }
    }

    if (firstTime) {
      setSaving(true)
      try {
        await api.me.update({
          safety: {
            speed_limit_kmh: config.ceiling,
            share_with_guardians: Boolean(config.shareWithGuardians),
            prefer_female_driver: Boolean(config.preferFemaleDriver),
          },
        })
      } catch {
        // Not saving the defaults must not block the ride; we ask again next time.
      }
      try {
        await refreshMe()
      } catch {
        // Refresh failure must not block booking.
      } finally {
        setSaving(false)
      }
    }
    onFindDriver(config)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (user?.full_name ?? '').trim().split(/\s+/)[0]
  const initials = (user?.full_name ?? 'MD')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const totalText =
    priceStatus === 'loading' ? null : quote.ready ? formatINR(quote.total) : '--'

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ── Scrollable Content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space.xl,
          paddingTop: space.lg,
          paddingBottom: space.xxxl,
          gap: space.xxxl,
        }}
      >
        {/* ── Greeting ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...type.caption, color: colors.textMuted, fontWeight: '500' }}>
              {greeting}
              {firstName ? `, ${firstName}` : ''}
            </Text>
            <Text accessibilityRole="header" style={{ ...type.headline, color: colors.text, marginTop: 2 }}>
              Book a driver
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.pill,
              backgroundColor: colors.brandSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...type.bodyBold, color: colors.brand }}>{initials}</Text>
          </View>
        </View>

        <Section title="What do you need?">
          <RequirementTabs
            selectedId={config.requirement}
            onChange={(r) => onChange({ ...config, requirement: r })}
          />
        </Section>

        <Section title="Your vehicle">
          <CarDetailsForm config={config} onChange={onChange} />
        </Section>

        <Section title={TRIP_TITLES[config.requirement] ?? TRIP_TITLES.within_city}>
          {config.requirement === 'within_city' && (
            <WithinCityForm config={config} onChange={onChange} />
          )}
          {config.requirement === 'inter_city' && (
            <InterCityForm config={config} onChange={onChange} />
          )}
          {config.requirement === 'airport' && (
            <AirportForm config={config} onChange={onChange} />
          )}
          {config.requirement === 'full_time' && requirementEnabled('full_time') && (
            <FullTimeForm config={config} onChange={onChange} />
          )}
        </Section>

        {/* ── Your driver (picked by the server) ── */}
        <Section title="Your driver" hint="Matched to your car and the time of the trip.">
          <Panel style={{ gap: space.sm }}>
            {skillsStatus === 'error' && !skills.length ? (
              <>
                <Text style={{ ...type.caption, color: colors.textMuted, fontWeight: '500' }}>
                  Could not load driver tiers. Check your connection.
                </Text>
                <Button label="Try again" variant="subtle" onPress={reloadSkills} />
              </>
            ) : tier ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <UserCheck size={18} color={colors.text} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ ...type.bodyBold, color: colors.text }}>{tier.label}</Text>
                  {tier.description ? (
                    <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 17 }}>{tier.description}</Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <Text style={{ ...type.caption, color: colors.textMuted, fontWeight: '500' }}>
                We pick the right certified driver for your car once the trip details are in.
              </Text>
            )}
          </Panel>
        </Section>

        {/* ── Safety ── */}
        <Section
          title={firstTime ? 'Set your safety preferences' : 'Safety'}
          hint={
            firstTime
              ? 'We ask once. Your choices are saved for every trip, and you can change them in Profile.'
              : 'Going over the speed limit alerts you, your guardians and the Safety Desk.'
          }
        >
          <Panel style={{ gap: space.md }}>
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Gauge size={18} color={colors.textMuted} />
                  <Text style={{ ...type.body, color: colors.text }}>Speed limit</Text>
                </View>
                <Text style={{ ...type.bodyBold, color: colors.brand }}>{config.ceiling} km/h</Text>
              </View>
              <Slider
                minimumValue={40}
                maximumValue={120}
                step={5}
                value={config.ceiling}
                onValueChange={(v) => onChange({ ...config, ceiling: clamp(Math.round(v), 40, 120) })}
                accessibilityLabel="Speed limit for this trip"
                accessibilityValue={{ min: 40, max: 120, now: config.ceiling, text: `${config.ceiling} kilometres per hour` }}
                minimumTrackTintColor={colors.brand}
                maximumTrackTintColor={colors.surfaceSunken}
                thumbTintColor={colors.brand}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ ...type.tiny, color: colors.textMuted }}>40 km/h</Text>
                <Text style={{ ...type.tiny, color: colors.textMuted }}>120 km/h</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
              <Toggle
                label="Share the trip with my guardians"
                checked={Boolean(config.shareWithGuardians)}
                onChange={(v) => onChange({ ...config, shareWithGuardians: v })}
              />
              <Toggle
                label="Prefer a female driver"
                checked={Boolean(config.preferFemaleDriver)}
                onChange={(v) => onChange({ ...config, preferFemaleDriver: v })}
              />
            </View>
          </Panel>
        </Section>

        {/* ── Price estimate ── */}
        <Section title="Price estimate">
          <Panel style={{ gap: space.md }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showFare ? 'Hide price details' : 'Show price details'}
              accessibilityState={{ expanded: showFare }}
              onPress={() => setShowFare((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}
            >
              <View style={{ flex: 1 }}>
                {totalText === null ? (
                  <ActivityIndicator
                    color={colors.brand}
                    accessibilityLabel="Getting your price"
                    style={{ alignSelf: 'flex-start', height: 22 }}
                  />
                ) : (
                  <Text style={{ ...type.title, color: colors.text }}>{totalText}</Text>
                )}
                <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 2 }}>Estimated total</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ ...type.caption, color: colors.textMuted }}>{showFare ? 'Hide' : 'Details'}</Text>
                {showFare ? (
                  <ChevronUp size={16} color={colors.textMuted} />
                ) : (
                  <ChevronDown size={16} color={colors.textMuted} />
                )}
              </View>
            </Pressable>

            {showFare && quote.lines.length > 0 ? (
              <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md }}>
                {quote.lines.map((line) => (
                  <View key={line.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.lg }}>
                    <Text style={{ ...type.caption, color: colors.textMuted, fontWeight: '500' }}>{line.label}</Text>
                    <Text style={{ ...type.caption, color: colors.text, textAlign: 'right', flex: 1 }} numberOfLines={2}>
                      {line.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {priceStatus === 'error' ? (
              <View style={{ gap: space.sm }}>
                <Text style={{ ...type.caption, color: colors.redPressed }}>
                  Could not get a price. Check your connection and try again.
                </Text>
                <Button label="Try again" variant="subtle" onPress={() => setPriceAttempt((n) => n + 1)} />
              </View>
            ) : quote.ready ? (
              <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 17 }}>
                This amount is held when you book. You are charged the final fare when the trip ends.
              </Text>
            ) : null}
          </Panel>
        </Section>
      </ScrollView>

      {/* ── Sticky CTA ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.lg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: space.xl,
          paddingVertical: space.md,
        }}
      >
        <View style={{ minWidth: 64 }}>
          <Text style={{ ...type.tiny, color: colors.textMuted }}>Estimated</Text>
          {totalText === null ? (
            <ActivityIndicator color={colors.brand} style={{ alignSelf: 'flex-start', height: 22 }} />
          ) : (
            <Text style={{ ...type.title, color: colors.text }}>{totalText}</Text>
          )}
        </View>
        <Button
          label={quote.skill ? `Find ${quote.skill.label} Driver` : 'Find a driver'}
          icon={Search}
          disabled={!quote.ready || saving}
          onPress={findDriver}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  )
}
