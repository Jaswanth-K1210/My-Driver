import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Slider from '@react-native-community/slider'
import { Gauge, Search } from 'lucide-react-native'
import { useAuth } from '../../context/AuthContext'
import { useTrip } from '../../context/TripContext'
import { quoteFor } from '../../lib/booking'
import { clamp, formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'

import RequirementTabs from './components/RequirementTabs'
import WithinCityForm from './components/WithinCityForm'
import CarDetailsForm from './components/CarDetailsForm'
import { AirportForm, FullTimeForm, InterCityForm } from './components/TripForms'

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
  const { skills } = useTrip()
  const { user } = useAuth()
  const name = user?.full_name ?? 'there'
  const initials = (user?.full_name ?? 'MD').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const quote = quoteFor(config, skills)
  const isIntercity = config.requirement === 'inter_city'
  const isAirport = config.requirement === 'airport'
  const isFullTime = config.requirement === 'full_time'

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>

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
            <Text style={{ ...type.bodyBold, color: colors.red }}>{initials}</Text>
          </View>
          <View>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>{greeting}</Text>
            <Text style={{ ...type.body, color: colors.text }}>{name}</Text>
          </View>
        </View>
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
            <SectionLabel>2. Your car</SectionLabel>
            <CarDetailsForm config={config} onChange={onChange} />
          </View>

          {/* Step 3: Route */}
          <Card>
            <SectionLabel>{isFullTime ? '3. Your contract' : '3. Your route'}</SectionLabel>
            {config.requirement === 'within_city' && (
              <WithinCityForm config={config} onChange={onChange} />
            )}
            {isIntercity && <InterCityForm config={config} onChange={onChange} />}
            {isAirport && <AirportForm config={config} onChange={onChange} />}
            {isFullTime && <FullTimeForm config={config} onChange={onChange} />}
          </Card>

          {/* Speed Ceiling */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
              <SectionLabel icon={Gauge}>Speed limit</SectionLabel>
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
            <SectionLabel>Price estimate</SectionLabel>
            <View style={{ gap: space.sm }}>
              {quote.lines.map((line) => (
                <View key={line.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ ...type.caption, color: colors.textMuted, flex: 1 }}>{line.label}</Text>
                  <Text style={{ ...type.caption, color: colors.text, flex: 1, textAlign: 'right' }}>{line.value}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.sm, paddingTop: space.sm }}>
                <Text style={{ ...type.bodyBold, color: colors.text }}>Estimated total</Text>
                <Text style={{ ...type.bodyBold, color: colors.red }}>{quote.ready ? formatINR(quote.total) : '--'}</Text>
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
          onPress={() => onFindDriver(config)}
        />
      </View>
    </SafeAreaView>
  )
}
