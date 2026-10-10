/**
 * SkillPicker — Smart Driver Certification & Tier selector.
 * Renders full cards with label, tagline, rate/km, description, and ETA.
 * Shows a "Recommended" badge on the auto-matched tier for the current vehicle + requirement.
 */
import { Pressable, Text, View } from 'react-native'
import { Check, Sparkles } from 'lucide-react-native'
import { SKILLS } from '../../../data/mock'
import { getRecommendedSkillId } from '../../../lib/booking'
import { colors, radius, space, type } from '../../../theme/tokens'

export default function SkillPicker({ config, onChange }) {
  const recommendedId = getRecommendedSkillId(config.carDetails, config.requirement)
  const skills = SKILLS

  return (
    <View style={{ gap: space.md }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5 }}>
          DRIVER CERTIFICATION & TIER
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Sparkles size={11} color={colors.brand} />
          <Text style={{ ...type.micro, color: colors.brand }}>Auto-matched for your vehicle</Text>
        </View>
      </View>

      {/* Skill Cards */}
      <View style={{ gap: space.sm }}>
        {skills.map((skill) => {
          const isSelected = skill.id === config.skillId
          const isRecommended = skill.id === recommendedId

          return (
            <Pressable
              key={skill.id}
              onPress={() => onChange({ ...config, skillId: skill.id })}
              style={{
                borderRadius: radius.lg,
                borderWidth: isSelected ? 1.5 : 1,
                borderColor: isSelected ? colors.brand : colors.border,
                backgroundColor: isSelected ? colors.brandSoft : colors.surface,
                padding: space.md,
                overflow: 'visible',
              }}
            >
              {/* Recommended badge */}
              {isRecommended && (
                <View
                  style={{
                    position: 'absolute',
                    top: -10,
                    right: space.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: colors.green,
                    borderRadius: radius.pill,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    zIndex: 1,
                  }}
                >
                  <Sparkles size={9} color="#fff" />
                  <Text style={{ ...type.micro, color: '#fff' }}>Recommended</Text>
                </View>
              )}

              {/* Top row: name + rate */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text
                  style={{
                    ...type.bodyBold,
                    color: isSelected ? colors.brandPressed : colors.text,
                  }}
                >
                  {skill.label}
                </Text>
                <View
                  style={{
                    backgroundColor: colors.surfaceAlt,
                    borderRadius: radius.sm,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ ...type.caption, color: colors.text, fontWeight: '800' }}>
                    ₹{skill.rate}/km
                  </Text>
                </View>
              </View>

              {/* Tagline */}
              <Text style={{ ...type.tiny, color: colors.brand, fontWeight: '700', marginBottom: 4 }}>
                {skill.tagline}
              </Text>

              {/* Description */}
              <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 16 }} numberOfLines={2}>
                {skill.description}
              </Text>

              {/* Footer: ETA + Selected status */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: space.sm,
                  paddingTop: space.sm,
                  borderTopWidth: 1,
                  borderTopColor: isSelected ? '#fca5a5' : colors.border,
                }}
              >
                <Text style={{ ...type.micro, color: colors.textFaint }}>ETA: {skill.eta}</Text>
                {isSelected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Check size={12} color={colors.brand} />
                    <Text style={{ ...type.micro, color: colors.brand, fontWeight: '800' }}>Selected</Text>
                  </View>
                ) : (
                  <Text style={{ ...type.micro, color: colors.textFaint }}>Tap to choose</Text>
                )}
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
