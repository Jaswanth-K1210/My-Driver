import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Car } from 'lucide-react-native'
import { SAVED_GARAGE } from '../../../data/mock'
import { colors, radius, space, type } from '../../../theme/tokens'

export default function CarDetailsForm({ config, onChange }) {
  const [useGarage, setUseGarage] = useState(true)

  return (
    <View style={{ gap: space.md }}>
      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 }}>
        <Pressable
          onPress={() => setUseGarage(true)}
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: useGarage ? colors.surface : 'transparent', borderRadius: radius.md - 2, shadowColor: useGarage ? '#000' : 'transparent', shadowOpacity: 0.05, shadowRadius: 3, elevation: useGarage ? 1 : 0 }}
        >
          <Text style={{ ...type.caption, color: useGarage ? colors.text : colors.textMuted }}>Saved Garage</Text>
        </Pressable>
        <Pressable
          onPress={() => setUseGarage(false)}
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: !useGarage ? colors.surface : 'transparent', borderRadius: radius.md - 2, shadowColor: !useGarage ? '#000' : 'transparent', shadowOpacity: 0.05, shadowRadius: 3, elevation: !useGarage ? 1 : 0 }}
        >
          <Text style={{ ...type.caption, color: !useGarage ? colors.text : colors.textMuted }}>New Vehicle</Text>
        </Pressable>
      </View>

      {useGarage ? (
        <View style={{ gap: space.sm }}>
          {SAVED_GARAGE.map((car) => {
            const selected = config.carDetails?.savedVehicleId === car.id
            return (
              <Pressable
                key={car.id}
                onPress={() => onChange({ ...config, carDetails: { ...car, savedVehicleId: car.id, isCustom: false } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderWidth: 1, borderColor: selected ? colors.brand : colors.border, backgroundColor: selected ? colors.brandSoft : colors.surface, borderRadius: radius.md }}
              >
                <Car size={20} color={selected ? colors.brand : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...type.bodyBold, color: selected ? colors.brandPressed : colors.text }}>{car.company} {car.model}</Text>
                  <Text style={{ ...type.caption, color: colors.textMuted }}>{car.plate} · {car.transmission} · {car.engineType}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      ) : (
        <View style={{ padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }}>
          <Text style={{ ...type.caption, color: colors.textMuted, textAlign: 'center' }}>
            New vehicle form goes here (simplified for demo)
          </Text>
        </View>
      )}
    </View>
  )
}
