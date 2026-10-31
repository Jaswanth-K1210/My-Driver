import { Pressable, Text, View } from 'react-native'
import { Briefcase, MapPin, Plane, Route } from 'lucide-react-native'
import { REQUIREMENTS } from '../../../data/mock'
import { requirementEnabled } from '../../../lib/features'
import { colors, radius, space, type } from '../../../theme/tokens'

// Phase-gated requirements (see lib/features.js) are hidden, not disabled.
const OPTIONS = REQUIREMENTS.filter((req) => requirementEnabled(req.id))

const ICONS = {
  within_city: MapPin,
  inter_city: Route,
  airport: Plane,
  full_time: Briefcase,
}

export default function RequirementTabs({ selectedId, onChange }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {OPTIONS.map((req) => {
        const selected = req.id === selectedId
        const Icon = ICONS[req.id] ?? MapPin
        return (
          <Pressable
            key={req.id}
            accessibilityRole="button"
            accessibilityLabel={`${req.label}: ${req.tagline}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(req.id)}
            style={{
              // Two per row; with an odd count (a phase-gated tab hidden) the
              // last tile grows to the full width rather than squeezing three
              // labels into one row.
              flexGrow: 1,
              flexBasis: '45%',
              borderRadius: radius.lg,
              borderWidth: selected ? 1.5 : 1,
              borderColor: selected ? colors.red : colors.border,
              backgroundColor: selected ? colors.redSofter : colors.surface,
              paddingHorizontal: space.md,
              paddingVertical: 14,
              gap: space.sm,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: radius.sm,
                  backgroundColor: selected ? colors.red : colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={16} color={selected ? colors.onRed : colors.text} />
              </View>
              <Text style={{ ...type.bodyBold, color: colors.text, flexShrink: 1 }} numberOfLines={1}>
                {req.label}
              </Text>
            </View>
            <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 16 }} numberOfLines={2}>
              {req.tagline}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
