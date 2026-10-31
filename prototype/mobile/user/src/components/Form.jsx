/**
 * Small form primitives shared by the booking screens, so every section uses
 * the same label, segmented control, stepper and notice instead of each form
 * re-inventing its own.
 */
import { Pressable, Text, View } from 'react-native'
import { Info, Minus, Plus } from 'lucide-react-native'
import { colors, radius, space, type } from '../theme/tokens'

/** Sentence-case field label. */
export function FieldLabel({ children, hint, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginBottom: space.sm }, style]}>
      <Text style={{ ...type.caption, color: colors.textMuted }}>{children}</Text>
      {hint ? <Text style={{ ...type.tiny, color: colors.textMuted, fontWeight: '500' }}>{hint}</Text> : null}
    </View>
  )
}

/** Full-width segmented control; the active segment lifts to a white pill. */
export function Segmented({ options, value, onChange, style }) {
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
        const active = value === opt.id
        return (
          <Pressable
            key={opt.id}
            accessibilityRole="tab"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.id)}
            style={{
              flex: 1,
              paddingVertical: 9,
              alignItems: 'center',
              borderRadius: radius.sm,
              backgroundColor: active ? colors.surface : 'transparent',
              shadowColor: colors.graphite,
              shadowOpacity: active ? 0.08 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
              elevation: active ? 1 : 0,
            }}
          >
            <Text
              style={{
                ...type.caption,
                color: active ? colors.text : colors.textMuted,
                fontWeight: active ? '700' : '600',
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function StepButton({ icon: Icon, onPress, disabled, label }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      })}
    >
      <Icon size={16} color={colors.text} />
    </Pressable>
  )
}

/** Label on the left, − value + on the right. */
export function StepperRow({ label, hint, value, onDec, onInc, canDec = true, canInc = true }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.body, color: colors.text }}>{label}</Text>
        {hint ? <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <StepButton icon={Minus} label={`Decrease ${label}`} onPress={onDec} disabled={!canDec} />
        <Text style={{ ...type.bodyBold, color: colors.text, minWidth: 56, textAlign: 'center' }}>{value}</Text>
        <StepButton icon={Plus} label={`Increase ${label}`} onPress={onInc} disabled={!canInc} />
      </View>
    </View>
  )
}

/** Selectable chip for quick presets. */
export function Chip({ label, active, disabled, onPress, accessibilityLabel }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? colors.red : colors.border,
        backgroundColor: active ? colors.redSoft : colors.surface,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ ...type.caption, color: active ? colors.redPressed : colors.text }}>{label}</Text>
    </Pressable>
  )
}

/** Quiet inline note — neutral by design; red is reserved for actions/danger. */
export function Notice({ children, style }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space.sm,
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: 10,
        },
        style,
      ]}
    >
      <Info size={15} color={colors.textMuted} style={{ marginTop: 2 }} />
      <Text style={{ ...type.tiny, color: colors.textMuted, flex: 1, lineHeight: 18 }}>{children}</Text>
    </View>
  )
}

/** Plain bordered panel used to group a section's controls. */
export function Panel({ children, style }) {
  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
          gap: space.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
