/**
 * SkillPicker — Smart Driver Certification & Tier selector.
 * Tiers, names and prices come from the server's rate cards (useTrip().skills),
 * so a price change in the console shows here. Nothing is bundled.
 * Shows a "Recommended" badge on the auto-matched tier for the current vehicle + requirement.
 */
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Check, RefreshCw, Sparkles } from 'lucide-react-native'
import { getRecommendedSkillId } from '../../../lib/booking'
import { colors, radius, space, type } from '../../../theme/tokens'

export default function SkillPicker({ config, onChange, skills = [], status = 'ready', onRetry }) {
  const recommendedId = getRecommendedSkillId(config.carDetails, config.requirement)

  if (!skills.length) {
    const failed = status === 'error'
    return (
      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceAlt,
          padding: space.lg,
          alignItems: 'center',
          gap: space.sm,
        }}
      >
        {failed ? (
          <>
            <Text style={{ ...type.body, color: colors.text, textAlign: 'center' }}>
              Could not load driver tiers and prices
            </Text>
            <Text style={{ ...type.caption, color: colors.textMuted, textAlign: 'center' }}>
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel="Try loading driver tiers again"
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm }}
            >
              <RefreshCw size={14} color={colors.brand} />
              <Text style={{ ...type.bodyBold, color: colors.brand }}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.brand} />
            <Text style={{ ...type.caption, color: colors.textMuted }}>Loading driver tiers and prices</Text>
          </>
        )}
      </View>
    )
  }

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
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${skill.label}, ${skill.rate} rupees per kilometre${isRecommended ? ', recommended' : ''}`}
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
                    backgroundColor: colors.graphite,
                    borderRadius: radius.pill,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    zIndex: 1,
                  }}
                >
                  <Sparkles size={9} color={colors.onGraphite} />
                  <Text style={{ ...type.micro, color: colors.onGraphite }}>Recommended</Text>
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
              {skill.tagline ? (
                <Text style={{ ...type.tiny, color: colors.brand, fontWeight: '700', marginBottom: 4 }}>
                  {skill.tagline}
                </Text>
              ) : null}

              {/* Description */}
              {skill.description ? (
                <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 16 }} numberOfLines={2}>
                  {skill.description}
                </Text>
              ) : null}

              {/* Footer: hourly rate + Selected status */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: space.sm,
                  paddingTop: space.sm,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ ...type.micro, color: colors.textMuted }}>₹{skill.hourlyRate}/hour for hourly hire</Text>
                {isSelected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Check size={12} color={colors.brand} />
                    <Text style={{ ...type.micro, color: colors.brand, fontWeight: '800' }}>Selected</Text>
                  </View>
                ) : (
                  <Text style={{ ...type.micro, color: colors.textMuted }}>Tap to choose</Text>
                )}
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
