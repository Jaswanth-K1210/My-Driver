import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, space, type } from '../theme/tokens'

/** Bottom tabs for the screens a driver uses between trips. */
export default function TabBar({ tabs, active, onChange }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
        paddingBottom: insets.bottom,
      }}
    >
      {tabs.map(({ key, label, icon: Icon }) => {
        const selected = key === active
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            onPress={() => onChange(key)}
            style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: space.sm }}
          >
            <Icon size={20} color={selected ? colors.red : colors.textMuted} />
            <Text style={{ ...type.micro, color: selected ? colors.red : colors.textMuted }}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
