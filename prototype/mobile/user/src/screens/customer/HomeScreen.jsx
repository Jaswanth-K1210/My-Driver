/**
 * HomeScreen — the complete booking UI for the MyDriver user app.
 *
 * Steps (in scroll order):
 *   1. What do you need?          — RequirementTabs
 *   2. Your Vehicle               — CarDetailsForm (saved garage + new vehicle)
 *   3. Trip Details               — WithinCityForm / InterCityForm / AirportForm / FullTimeForm
 *   4. Driver Certification       — SkillPicker (full cards with recommended badge)
 *   5. Speed Ceiling              — Slider 40–120 km/h
 *   6. Price Estimate             — Live quote breakdown
 *
 * Sticky CTA: "Find [Skill] Driver" — disabled until quote.ready
 */
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Slider from '@react-native-community/slider'
import { Gauge, Search } from 'lucide-react-native'
import { useTrip } from '../../context/TripContext'
import { useAuth } from '../../context/AuthContext'
import { useEffect, useState } from 'react'
import { quoteFor, serverQuote } from '../../lib/booking'
import { api } from '../../lib/apiClient'
import { clamp, formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'
import Button from '../../components/Button'
import Card from '../../components/Card'

import RequirementTabs from './components/RequirementTabs'
import CarDetailsForm from './components/CarDetailsForm'
import WithinCityForm from './components/WithinCityForm'
import InterCityForm from './components/InterCityForm'
import AirportForm from './components/AirportForm'
import FullTimeForm from './components/FullTimeForm'
import SkillPicker from './components/SkillPicker'

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
          <Text style={{ ...type.micro, color: '#fff' }}>{step}</Text>
        </View>
      )}
      <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
        {String(children).toUpperCase()}
      </Text>
    </View>
  )
}

/* ── Main Component ──────────────────────────────────────────────────────── */

export default function HomeScreen({ config, onChange, onFindDriver }) {
  const { skills } = useTrip()
  const { user } = useAuth()

  const [server, setServer] = useState(null)

  const platformFee = server ? server.fare.platform_fee : 19
  const baseNightFee = server ? (server.fare.night_fee > 0 ? server.fare.night_fee : 30) : 30
  const local = quoteFor(config, skills, { platformFee, nightFee: baseNightFee })
  const quote = local

  useEffect(() => {
    if (!local.ready) {
      setServer(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      serverQuote(api, config, skills)
        .then((q) => {
          if (!cancelled && q) setServer(q)
        })
        .catch(() => {
          if (!cancelled) setServer(null)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [config, skills, local.ready])

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
            {config.requirement === 'full_time' && (
              <FullTimeForm config={config} onChange={onChange} />
            )}
          </View>

          {/* ── Step 4: Driver Certification ── */}
          <View>
            <SectionHeader step={4}>Driver Certification</SectionHeader>
            <SkillPicker
              config={config}
              onChange={onChange}
            />
          </View>

          {/* ── Step 5: Speed Ceiling ── */}
          <Card>
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
                <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5 }}>
                  SPEED CEILING
                </Text>
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
              minimumTrackTintColor={colors.brand}
              maximumTrackTintColor={colors.surfaceSunken}
              thumbTintColor={colors.brand}
            />
            <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 4 }}>
              Breaches alert you, your guardians and the Safety Desk instantly.
            </Text>
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
                <Text style={{ ...type.bodyBold, color: colors.brand }}>
                  {quote.ready ? formatINR(quote.total) : '--'}
                </Text>
              </View>
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
          label={`Find ${quote.skill?.label ?? 'Standard'} Driver`}
          icon={Search}
          disabled={!quote.ready}
          onPress={() => onFindDriver(config)}
        />
      </View>
    </SafeAreaView>
  )
}
