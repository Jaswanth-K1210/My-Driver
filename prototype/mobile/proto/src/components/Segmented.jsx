import { Pressable, Text, View } from 'react-native'
import { colors, radius, space, type } from '../theme/tokens'

export default function Segmented({ options, value, onChange, style }) {
  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          padding: 4,
        },
        style,
      ]}
    >
      {options.map((opt) => {
        const selected = value === opt.id
        return (
          <Pressable
            key={opt.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.id)}
            style={{
              flex: 1,
              borderRadius: radius.sm,
              paddingVertical: space.sm,
              paddingHorizontal: space.sm,
              alignItems: 'center',
              backgroundColor: selected ? colors.red : 'transparent',
            }}
          >
            <Text style={{ ...type.caption, color: selected ? colors.onRed : colors.textMuted }}>
              {opt.label ?? opt.name}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
