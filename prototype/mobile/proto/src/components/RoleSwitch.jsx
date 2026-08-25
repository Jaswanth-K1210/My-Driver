import { Pressable, Text, View } from 'react-native'
import { Car, User } from 'lucide-react-native'
import { colors, radius, space, type } from '../theme/tokens'

const MODES = [
  { id: 'customer', label: 'Customer', Icon: User },
  { id: 'driver', label: 'Driver', Icon: Car },
]

/**
 * Prototype-only affordance. The web prototype puts this outside the phone
 * frame; on device there is no frame, so it lives in the home screen headers.
 */
export default function RoleSwitch({ role, onChange }) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="App mode"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
      }}
    >
      {MODES.map(({ id, label, Icon }) => {
        const selected = role === id
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              borderRadius: radius.pill,
              paddingHorizontal: space.md,
              paddingVertical: 6,
              backgroundColor: selected ? colors.red : 'transparent',
            }}
          >
            <Icon size={13} color={selected ? colors.onRed : colors.textMuted} />
            <Text style={{ ...type.micro, color: selected ? colors.onRed : colors.textMuted }}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
