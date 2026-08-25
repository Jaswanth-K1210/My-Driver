import { Pressable, Text, View } from 'react-native'
import { colors, radius, space, type } from '../theme/tokens'

/**
 * `variant` carries intent. Because red is the brand colour, "danger" is not a
 * different hue — it is a deeper red plus whatever icon the caller passes.
 */
const VARIANTS = {
  primary: { bg: colors.red, fg: colors.onRed, border: colors.red },
  danger: { bg: colors.redDeep, fg: colors.onRed, border: colors.redDeep },
  outline: { bg: colors.surface, fg: colors.red, border: colors.red },
  subtle: { bg: colors.surfaceAlt, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
  disabled: { bg: colors.surfaceSunken, fg: colors.textFaint, border: colors.border },
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  icon: Icon,
  disabled = false,
  style,
  accessibilityLabel,
}) {
  const v = disabled ? VARIANTS.disabled : (VARIANTS[variant] ?? VARIANTS.primary)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: v.border,
          backgroundColor: pressed && !disabled && variant === 'primary' ? colors.redPressed : v.bg,
          paddingVertical: 14,
          paddingHorizontal: space.lg,
          opacity: pressed && !disabled ? 0.92 : 1,
        },
        style,
      ]}
    >
      {Icon ? <Icon size={16} color={v.fg} /> : null}
      <Text style={{ ...type.bodyBold, color: v.fg }}>{label}</Text>
    </Pressable>
  )
}

/** Small pill used for statuses and metadata. */
export function Pill({ label, tone = 'neutral', style }) {
  const tones = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    brand: { bg: colors.redSoft, fg: colors.redPressed },
    solid: { bg: colors.red, fg: colors.onRed },
    safe: { bg: colors.surfaceAlt, fg: colors.graphite },
  }
  const t = tones[tone] ?? tones.neutral

  return (
    <View
      style={[
        {
          borderRadius: radius.sm,
          paddingHorizontal: space.sm,
          paddingVertical: 3,
          backgroundColor: t.bg,
        },
        style,
      ]}
    >
      <Text style={{ ...type.micro, color: t.fg }}>{label}</Text>
    </View>
  )
}
