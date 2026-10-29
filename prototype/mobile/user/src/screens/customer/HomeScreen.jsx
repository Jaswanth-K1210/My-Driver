/**
 * HomeScreen — the complete booking UI for the MyDriver user app.
 *
 * Steps (in scroll order):
 *   1. What do you need?          — RequirementTabs
 *   2. Your Vehicle               — CarDetailsForm (saved garage + new vehicle)
 *   3. Trip Details               — WithinCityForm / InterCityForm / AirportForm / FullTimeForm
 *   4. Your driver                — the tier the server picks from the car
 *   5. Safety                     — speed limit, guardians, female driver;
 *                                   asked once, then pre-filled from /v1/me
 *   6. Price Estimate             — Live quote breakdown
 *
 * Sticky CTA: "Find [Tier] Driver" — disabled until quote.ready
 */
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Slider from '@react-native-community/slider'
import { Gauge, Search, ShieldCheck } from 'lucide-react-native'
import { useTrip } from '../../context/TripContext'
import { useAuth } from '../../context/AuthContext'
import { useEffect, useState } from 'react'
import { quoteFor, serverQuote } from '../../lib/booking'
import { api } from '../../lib/apiClient'
import { requirementEnabled } from '../../lib/features'
import { clamp, formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Toggle from '../../components/Toggle'

import RequirementTabs from './components/RequirementTabs'
import CarDetailsForm from './components/CarDetailsForm'
import WithinCityForm from './components/WithinCityForm'
import InterCityForm from './components/InterCityForm'
import AirportForm from './components/AirportForm'
import FullTimeForm from './components/FullTimeForm'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function SectionHeader({ step, children }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
      {step != null && (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: radius.pill,
            backgroundColor: colors.graphite,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ ...type.micro, color: colors.onGraphite }}>{step}</Text>
        </View>
      )}
      <Text accessibilityRole="header" style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
        {String(children).toUpperCase()}
      </Text>
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
        void refreshMe()
      } catch {
        // Not saving the defaults must not block the ride; we ask again next time.
      } finally {
        setSaving(false)
      }
    }
    onFindDriver(config)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>

      {/* ── App Bar ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.xl,
          paddingBottom: space.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              backgroundColor: colors.brandSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...type.bodyBold, color: colors.brand }}>{(user?.full_name ?? 'MD').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>{greeting}</Text>
            <Text style={{ ...type.body, color: colors.text }}>{user?.full_name ?? 'MyDriver rider'}</Text>
          </View>
        </View>
      </View>

      {/* ── Scrollable Content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xxl, gap: space.xl }}
      >
        {/* ── Step 1: Requirement ── */}
        <View>
          <View style={{ paddingHorizontal: space.xl }}>
            <SectionHeader step={1}>What do you need?</SectionHeader>
          </View>
          <RequirementTabs
            selectedId={config.requirement}
            onChange={(r) => onChange({ ...config, requirement: r })}
          />
        </View>

        <View style={{ paddingHorizontal: space.xl, gap: space.xl }}>
          {/* ── Step 2: Vehicle ── */}
          <View>
            <SectionHeader step={2}>Your Vehicle</SectionHeader>
            <CarDetailsForm config={config} onChange={onChange} />
          </View>

          {/* ── Step 3: Trip Details ── */}
          <View>
            <SectionHeader step={3}>
              {config.requirement === 'within_city'
                ? 'Route & Duration'
                : config.requirement === 'inter_city'
                ? 'Outstation Route & Duration'
                : config.requirement === 'airport'
                ? 'Airport Transfer Details'
                : 'Full-Time Contract Details'}
            </SectionHeader>
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
          </View>

          {/* ── Step 4: Your driver (picked by the server) ── */}
          <View>
            <SectionHeader step={4}>Your Driver</SectionHeader>
            <Card>
              {skillsStatus === 'error' && !skills.length ? (
                <View style={{ gap: space.sm }}>
                  <Text style={{ ...type.caption, color: colors.textMuted }}>
                    Could not load driver tiers. Check your connection.
                  </Text>
                  <Button label="Try again" variant="subtle" onPress={reloadSkills} />
                </View>
              ) : tier ? (
                <View style={{ gap: 4 }}>
                  <Text style={{ ...type.bodyBold, color: colors.text }}>{tier.label}</Text>
                  {tier.description ? (
                    <Text style={{ ...type.caption, color: colors.textMuted }}>{tier.description}</Text>
                  ) : null}
                  <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 4 }}>
                    Matched to your car and the time of the trip.
                  </Text>
                </View>
              ) : (
                <Text style={{ ...type.caption, color: colors.textMuted }}>
                  We pick the right certified driver for your car once the trip details are in.
                </Text>
              )}
            </Card>
          </View>

          {/* ── Step 5: Safety ── */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm }}>
              <ShieldCheck size={14} color={colors.textMuted} />
              <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5 }}>
                {firstTime ? 'SET YOUR SAFETY PREFERENCES' : 'SAFETY'}
              </Text>
            </View>
            {firstTime ? (
              <Text style={{ ...type.tiny, color: colors.textMuted, marginBottom: space.sm, lineHeight: 16 }}>
                We ask once. Your choices are saved for every trip, and you can change them in Profile.
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: space.sm,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Gauge size={14} color={colors.textMuted} />
                <Text style={{ ...type.caption, color: colors.text }}>Speed limit</Text>
              </View>
              <View
                style={{
                  backgroundColor: colors.brandSoft,
                  borderRadius: radius.sm,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ ...type.caption, color: colors.brand, fontWeight: '900' }}>
                  {config.ceiling} km/h
                </Text>
              </View>
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
            <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 4, marginBottom: space.sm }}>
              Breaches alert you, your guardians and the Safety Desk instantly.
            </Text>
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
          </Card>

          {/* ── Step 6: Price Estimate ── */}
          <Card>
            <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5, marginBottom: space.md }}>
              PRICE ESTIMATE
            </Text>
            <View style={{ gap: space.sm }}>
              {quote.lines.map((line) => (
                <View
                  key={line.label}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}
                >
                  <Text style={{ ...type.caption, color: colors.textMuted, flex: 1 }}>
                    {line.label}
                  </Text>
                  <Text
                    style={{
                      ...type.caption,
                      color: colors.text,
                      fontWeight: '700',
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {line.value}
                  </Text>
                </View>
              ))}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  marginTop: space.sm,
                  paddingTop: space.sm,
                }}
              >
                <Text style={{ ...type.bodyBold, color: colors.text }}>Estimated total</Text>
                {priceStatus === 'loading' ? (
                  <ActivityIndicator color={colors.brand} accessibilityLabel="Getting your price" />
                ) : (
                  <Text style={{ ...type.bodyBold, color: colors.brand }}>
                    {quote.ready ? formatINR(quote.total) : '--'}
                  </Text>
                )}
              </View>
              {priceStatus === 'error' ? (
                <View style={{ gap: space.sm, marginTop: space.sm }}>
                  <Text style={{ ...type.caption, color: colors.redPressed }}>
                    Could not get a price. Check your connection and try again.
                  </Text>
                  <Button label="Try again" variant="subtle" onPress={() => setPriceAttempt((n) => n + 1)} />
                </View>
              ) : quote.ready ? (
                <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 4, lineHeight: 16 }}>
                  This amount is held when you book. You are charged the final fare when the trip ends.
                </Text>
              ) : null}
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* ── Sticky CTA ── */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: space.xl,
          paddingVertical: space.lg,
        }}
      >
        <Button
          label={quote.skill ? `Find ${quote.skill.label} Driver` : 'Find a driver'}
          icon={Search}
          disabled={!quote.ready || saving}
          onPress={findDriver}
        />
      </View>
    </SafeAreaView>
  )
}
