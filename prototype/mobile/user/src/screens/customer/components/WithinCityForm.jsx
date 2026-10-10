/**
 * WithinCityForm — route planner + duration picker for "Within City" trips.
 */
import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Clock, Info, Minus, Plus } from 'lucide-react-native'
import { getMinDurationForConfig } from '../../../lib/booking'
import { colors, radius, space, type } from '../../../theme/tokens'
import RoutePlannerCard from './RoutePlannerCard'

const DURATION_PRESETS = [1, 2, 4, 8]

export default function WithinCityForm({ config, onChange }) {
  const minDur = getMinDurationForConfig(config)

  // Auto-clamp duration if route requires more time
  useEffect(() => {
    if (config.durationHours < minDur.minHours) {
      onChange({ ...config, durationHours: minDur.minHours })
    }
  }, [
    minDur.minHours,
    config.pickupId,
    config.dropId,
    config.stops,
    config.returnStops,
    config.returnDropId,
    config.tripType,
  ])

  const setDuration = (h) => onChange({ ...config, durationHours: h })

  return (
    <View style={{ gap: space.md }}>
      {/* Route Planner */}
      <RoutePlannerCard config={config} onChange={onChange} isInterCity={false} />

      {/* Duration Picker */}
      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.md,
          gap: space.md,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: space.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={15} color={colors.brand} />
            <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5 }}>
              ESTIMATED DURATION
            </Text>
          </View>
          <Text style={{ ...type.caption, color: colors.brand, fontWeight: '900' }}>
            {config.durationHours} Hours
          </Text>
        </View>

        {/* Minimum requirement notice */}
        {minDur.minHours > 1 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: space.sm,
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              padding: space.sm,
            }}
          >
            <Info size={15} color={colors.textMuted} style={{ marginTop: 1 }} />
            <Text style={{ ...type.tiny, color: colors.text, flex: 1 }}>{minDur.label}</Text>
          </View>
        )}

        {/* Preset buttons + ± stepper */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: space.sm }}>
            {DURATION_PRESETS.map((h) => {
              const belowMin = h < minDur.minHours
              const active = config.durationHours === h
              return (
                <Pressable
                  key={h}
                  onPress={() => !belowMin && setDuration(h)}
                  disabled={belowMin}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    alignItems: 'center',
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: active ? colors.brand : belowMin ? colors.surfaceSunken : colors.border,
                    backgroundColor: active ? colors.brandSoft : belowMin ? colors.surfaceSunken : colors.surface,
                    opacity: belowMin ? 0.45 : 1,
                  }}
                >
                  <Text
                    style={{
                      ...type.caption,
                      color: active ? colors.brand : belowMin ? colors.textFaint : colors.text,
                      fontWeight: '800',
                    }}
                  >
                    {h}{h === 1 ? ' hr' : ' hrs'}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* ± Stepper */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceAlt,
              padding: 3,
            }}
          >
            <Pressable
              onPress={() => setDuration(Math.max(minDur.minHours, config.durationHours - 1))}
              disabled={config.durationHours <= minDur.minHours}
              style={{
                width: 28,
                height: 28,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm - 2,
                opacity: config.durationHours <= minDur.minHours ? 0.3 : 1,
              }}
            >
              <Minus size={13} color={colors.textMuted} />
            </Pressable>
            <Text
              style={{
                width: 30,
                textAlign: 'center',
                ...type.bodyBold,
                color: colors.text,
              }}
            >
              {config.durationHours}h
            </Text>
            <Pressable
              onPress={() => setDuration(Math.min(24, config.durationHours + 1))}
              style={{
                width: 28,
                height: 28,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm - 2,
              }}
            >
              <Plus size={13} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}
