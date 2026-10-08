import { Pressable, Text, TextInput, View } from 'react-native'
import { colors, radius, space, type } from '../../../theme/tokens'

const input = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  backgroundColor: colors.surface,
  paddingHorizontal: space.md,
  paddingVertical: 10,
  ...type.body,
  color: colors.text,
}

function Chips({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {options.map((opt) => {
        const selected = value === opt
        return (
          <Pressable
            key={opt}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 10,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: selected ? colors.red : colors.border,
              backgroundColor: selected ? colors.redSoft : colors.surface,
            }}
          >
            <Text style={{ ...type.caption, color: selected ? colors.redPressed : colors.text }}>{opt}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * The customer's own car, which the driver will drive. Transmission and make
 * feed the recommended driver tier (getRecommendedSkillId), so they matter.
 */
export default function CarDetailsForm({ config, onChange }) {
  const car = config.carDetails ?? {}
  const set = (patch) => onChange({ ...config, carDetails: { ...car, ...patch, isCustom: true } })

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <TextInput
          style={[input, { flex: 1 }]}
          placeholder="Make, e.g. Hyundai"
          placeholderTextColor={colors.textFaint}
          value={car.company ?? ''}
          onChangeText={(company) => set({ company })}
          accessibilityLabel="Car make"
        />
        <TextInput
          style={[input, { flex: 1 }]}
          placeholder="Model, e.g. Creta"
          placeholderTextColor={colors.textFaint}
          value={car.model ?? ''}
          onChangeText={(model) => set({ model })}
          accessibilityLabel="Car model"
        />
      </View>
      <TextInput
        style={[input, { letterSpacing: 1 }]}
        placeholder="Registration, e.g. TS 09 AB 1234"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="characters"
        value={car.plate ?? ''}
        onChangeText={(plate) => set({ plate: plate.toUpperCase() })}
        accessibilityLabel="Registration number"
      />
      <Chips options={['Manual', 'Automatic']} value={car.transmission} onChange={(transmission) => set({ transmission })} />
      <Chips options={['Petrol', 'Diesel', 'EV', 'CNG']} value={car.engineType} onChange={(engineType) => set({ engineType })} />
    </View>
  )
}
