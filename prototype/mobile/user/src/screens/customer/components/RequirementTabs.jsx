import { Pressable, Text, View } from 'react-native'
import { REQUIREMENTS } from '../../../data/mock'
import { requirementEnabled } from '../../../lib/features'
import { colors, radius, space, type } from '../../../theme/tokens'

// Phase-gated requirements (see lib/features.js) are hidden, not disabled.
const OPTIONS = REQUIREMENTS.filter((req) => requirementEnabled(req.id))

export default function RequirementTabs({ selectedId, onChange }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {OPTIONS.map((req) => {
        const selected = req.id === selectedId
        return (
          <Pressable
            key={req.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(req.id)}
            style={{
              flex: 1,
              minWidth: OPTIONS.length % 2 === 0 ? '45%' : '30%',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: selected ? colors.red : colors.border,
              backgroundColor: selected ? colors.redSoft : colors.surface,
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 2,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...type.caption, color: selected ? colors.redPressed : colors.text }}>
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
