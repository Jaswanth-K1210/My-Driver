import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Slider from '@react-native-community/slider'
import { Bell, Gauge, Search, Shield } from 'lucide-react-native'
import { CUSTOMER, SKILLS, VISION_MODES } from '../../data/mock'
import { useTrip } from '../../context/TripContext'
import { quoteFor } from '../../lib/booking'
import { clamp, formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import FakeStatusBar from '../../components/StatusBar'
import { useToast } from '../../components/Toast'

import RequirementTabs from './components/RequirementTabs'
import WithinCityForm from './components/WithinCityForm'
import CarDetailsForm from './components/CarDetailsForm'

function SectionLabel({ children, icon: Icon }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm }}>
      {Icon ? <Icon size={13} color={colors.textMuted} /> : null}
      <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
        {String(children).toUpperCase()}
      </Text>
    </View>
  )
}

export default function HomeScreen({ config, onChange, onFindDriver }) {
  const { toast } = useToast()
  const { skills } = useTrip()

  const quote = quoteFor(config, skills)
  const isIntercity = config.requirement === 'inter_city'
  const isAirport = config.requirement === 'airport'
  const isFullTime = config.requirement === 'full_time'

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FakeStatusBar />

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
          <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.redSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...type.bodyBold, color: colors.red }}>{CUSTOMER.initials}</Text>
          </View>
          <View>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>Good evening</Text>
            <Text style={{ ...type.body, color: colors.text }}>{CUSTOMER.name}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => toast('No new alerts — all trips sealed', 'info')}
          style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 10 }}
        >
          <Bell size={16} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl, gap: space.lg }}>
        
        {/* Step 1: Requirement Selection */}
        <View>
          <View style={{ paddingHorizontal: space.xl }}>
            <SectionLabel>1. What do you need?</SectionLabel>
          </View>
          <RequirementTabs selectedId={config.requirement} onChange={(r) => onChange({ ...config, requirement: r })} />
        </View>

        <View style={{ paddingHorizontal: space.xl, gap: space.lg }}>
          
          {/* Step 2: Vehicle Specs */}
          <View>
            <SectionLabel>2. Your Vehicle</SectionLabel>
            <CarDetailsForm config={config} onChange={onChange} />
          </View>

          {/* Step 3: Route */}
          <Card>
            <SectionLabel>3. Route Planner</SectionLabel>
            {config.requirement === 'within_city' && (
              <WithinCityForm config={config} onChange={onChange} />
            )}
            {isIntercity && (
              <View style={{ padding: space.md, alignItems: 'center' }}>
                <Text style={{ ...type.caption, color: colors.textMuted }}>Inter-city routing UI placeholder</Text>
              </View>
            )}
            {isAirport && (
              <View style={{ padding: space.md, alignItems: 'center' }}>
                <Text style={{ ...type.caption, color: colors.textMuted }}>Airport transfers UI placeholder</Text>
              </View>
            )}
            {isFullTime && (
              <View style={{ padding: space.md, alignItems: 'center' }}>
                <Text style={{ ...type.caption, color: colors.textMuted }}>Full-time service UI placeholder</Text>
              </View>
            )}
          </Card>

          {/* VisionCam Mode */}
          <View>
            <SectionLabel icon={Shield}>VisionCam Mode</SectionLabel>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {VISION_MODES.map((mode) => {
                const selected = mode.id === config.visionMode
                return (
                  <Pressable
                    key={mode.id}
                    onPress={() => onChange({ ...config, visionMode: mode.id })}
                    style={{ flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.brand : colors.border, backgroundColor: selected ? colors.brandSoft : colors.surface }}
                  >
                    <Text style={{ ...type.bodyBold, color: selected ? colors.brandPressed : colors.text, textAlign: 'center' }}>Mode {mode.id}</Text>
                    <Text style={{ ...type.micro, color: colors.textMuted, textAlign: 'center', marginTop: 2 }}>{mode.name}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Speed Ceiling */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
              <SectionLabel icon={Gauge}>Speed ceiling</SectionLabel>
              <Pill label={`${config.ceiling} km/h`} tone={config.ceiling > 80 ? 'brand' : 'safe'} />
            </View>
            <Slider
              minimumValue={40}
              maximumValue={120}
              step={5}
              value={config.ceiling}
              onValueChange={(v) => onChange({ ...config, ceiling: clamp(Math.round(v), 40, 120) })}
              minimumTrackTintColor={colors.red}
              maximumTrackTintColor={colors.surfaceSunken}
              thumbTintColor={colors.red}
            />
          </Card>

          {/* Quote Estimation */}
          <Card>
            <SectionLabel>Price Estimate</SectionLabel>
            <View style={{ gap: space.sm }}>
              {quote.lines.map((line) => (
                <View key={line.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ ...type.caption, color: colors.textMuted, flex: 1 }}>{line.label}</Text>
                  <Text style={{ ...type.caption, color: colors.text, flex: 1, textAlign: 'right' }}>{line.value}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.sm, paddingTop: space.sm }}>
                <Text style={{ ...type.bodyBold, color: colors.text }}>Estimated total</Text>
                <Text style={{ ...type.bodyBold, color: colors.brand }}>{quote.ready ? formatINR(quote.total) : '--'}</Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, padding: space.lg }}>
        <Button
          label={`Find ${quote.skill.label} Driver`}
          icon={Search}
          disabled={!quote.ready}
          onPress={onFindDriver}
        />
      </View>
    </SafeAreaView>
  )
}
