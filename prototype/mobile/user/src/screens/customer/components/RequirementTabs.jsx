import { Pressable, Text, View, ScrollView } from 'react-native'
import { REQUIREMENTS } from '../../../data/mock'
import { colors, radius, space, type } from '../../../theme/tokens'

export default function RequirementTabs({ selectedId, onChange }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {REQUIREMENTS.map((req) => {
        const selected = req.id === selectedId
        return (
          <Pressable
            key={req.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(req.id)}
            style={{
              flex: 1,
              minWidth: '45%',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: selected ? colors.brand : colors.border,
              backgroundColor: selected ? colors.brandSoft : colors.surface,
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 2,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...type.caption, color: selected ? colors.brandPressed : colors.text }}>
                {req.label}
              </Text>
            </View>
            <Text style={{ ...type.micro, color: colors.textMuted }} numberOfLines={1}>
              {req.badge}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
