import { Pressable, Text, TextInput, View } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import { AIRPORT_LOCATIONS, CITY_LOCATIONS, DROPS, INTERCITY_DESTINATIONS } from '../../../data/mock'
import { colors, radius, space, type } from '../../../theme/tokens'
import { LocationDropdown } from './WithinCityForm'

function Label({ children }) {
  return <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6, marginBottom: 6 }}>{children}</Text>
}

function Segment({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 }}>
      {options.map(([id, label]) => {
        const on = value === id
        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(id)}
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md - 2, backgroundColor: on ? colors.surface : 'transparent' }}
          >
            <Text style={{ ...type.caption, color: on ? colors.text : colors.textMuted }}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Stepper({ value, min = 1, max = 30, onChange, unit }) {
  const btn = { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
      <Pressable accessibilityLabel={`Fewer ${unit}`} disabled={value <= min} onPress={() => onChange(value - 1)} style={[btn, { opacity: value <= min ? 0.4 : 1 }]}>
        <Minus size={16} color={colors.text} />
      </Pressable>
      <Text style={{ ...type.title, color: colors.text, minWidth: 80, textAlign: 'center' }}>
        {value} {unit}
      </Text>
      <Pressable accessibilityLabel={`More ${unit}`} disabled={value >= max} onPress={() => onChange(value + 1)} style={[btn, { opacity: value >= max ? 0.4 : 1 }]}>
        <Plus size={16} color={colors.text} />
      </Pressable>
    </View>
  )
}

export function InterCityForm({ config, onChange }) {
  const d = config.interCityDetails
  const set = (patch) => onChange({ ...config, interCityDetails: { ...d, ...patch }, ...(patch.destinationId ? { interCityDestination: patch.destinationId } : {}), ...(patch.days ? { interCityDays: patch.days } : {}) })
  const dest = INTERCITY_DESTINATIONS.find((x) => x.id === d.destinationId)

  return (
    <View style={{ gap: space.md }}>
      <Segment options={[['one_way', 'One way'], ['two_way', 'Round trip']]} value={config.tripType} onChange={(tripType) => onChange({ ...config, tripType })} />
      <View>
        <Label>FROM</Label>
        <LocationDropdown value={d.startLocationId} options={CITY_LOCATIONS} onChange={(startLocationId) => set({ startLocationId })} placeholder="Pickup point" />
      </View>
      <View>
        <Label>TO</Label>
        <LocationDropdown
          value={d.destinationId}
          options={INTERCITY_DESTINATIONS.map((x) => ({ ...x, name: `${x.name} · ${x.distanceKm} km` }))}
          onChange={(destinationId) => set({ destinationId })}
          placeholder="Destination city"
        />
      </View>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Label>DURATION</Label>
        <Stepper value={d.days} max={30} onChange={(days) => set({ days, durationUnit: 'days' })} unit={d.days === 1 ? 'day' : 'days'} />
        {dest ? (
          <Text style={{ ...type.tiny, color: colors.textMuted }}>About {dest.estHours} h each way · driver allowance included</Text>
        ) : null}
      </View>
    </View>
  )
}

export function AirportForm({ config, onChange }) {
  const a = config.airportDetails
  const set = (patch) => onChange({ ...config, airportDetails: { ...a, ...patch } })
  const arrival = a.flow === 'arrival'

  return (
    <View style={{ gap: space.md }}>
      <Segment options={[['departure', 'To the airport'], ['arrival', 'From the airport']]} value={a.flow} onChange={(flow) => set({ flow })} />
      <View>
        <Label>{arrival ? 'PICKUP AT' : 'DROP AT'}</Label>
        <LocationDropdown value={a.terminalId} options={AIRPORT_LOCATIONS} onChange={(terminalId) => set({ terminalId })} placeholder="Terminal" />
      </View>
      <View>
        <Label>{arrival ? 'DROP AT' : 'PICKUP FROM'}</Label>
        <LocationDropdown value={config.dropId} options={DROPS} onChange={(dropId) => onChange({ ...config, dropId })} placeholder="City location" />
      </View>
      <View>
        <Label>FLIGHT NUMBER (OPTIONAL)</Label>
        <TextInput
          value={a.flightNumber}
          onChangeText={(v) => set({ flightNumber: v.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) })}
          placeholder="e.g. 6E 2134"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, ...type.body, color: colors.text }}
        />
        <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 4 }}>
          {arrival ? 'Your driver waits at the arrivals pillar and tracks delays.' : 'Allow 3 hours before departure for domestic flights.'}
        </Text>
      </View>
    </View>
  )
}

export function FullTimeForm({ config, onChange }) {
  const f = config.fullTimeDetails
  const set = (patch) => onChange({ ...config, fullTimeDetails: { ...f, ...patch } })
  const max = { days: 30, weeks: 12, months: 12 }[f.durationUnit]
  const unit = f.durationCount === 1 ? f.durationUnit.slice(0, -1) : f.durationUnit

  return (
    <View style={{ gap: space.md }}>
      <View>
        <Label>AREA</Label>
        <TextInput
          value={f.locality}
          onChangeText={(locality) => set({ locality })}
          placeholder="e.g. Jubilee Hills & Banjara Hills"
          placeholderTextColor={colors.textFaint}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, ...type.body, color: colors.text }}
        />
      </View>
      <Segment
        options={[['days', 'Days'], ['weeks', 'Weeks'], ['months', 'Months']]}
        value={f.durationUnit}
        onChange={(durationUnit) => set({ durationUnit, durationCount: Math.min(f.durationCount, { days: 30, weeks: 12, months: 12 }[durationUnit]) })}
      />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Stepper value={f.durationCount} max={max} onChange={(durationCount) => set({ durationCount })} unit={unit} />
        <Text style={{ ...type.tiny, color: colors.textMuted }}>
          {f.workingHoursPerDay} hours a day · overtime ₹{f.overtimeRatePerHour}/hour
        </Text>
      </View>
    </View>
  )
}
