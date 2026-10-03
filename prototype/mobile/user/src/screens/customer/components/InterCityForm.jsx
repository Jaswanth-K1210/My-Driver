/**
 * InterCityForm — outstation route planner + day/hour duration picker.
 */
import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Clock, Info, Minus, Plus } from 'lucide-react-native'
import { getMinDurationForConfig } from '../../../lib/booking'
import { colors, radius, space, type } from '../../../theme/tokens'
import RoutePlannerCard from './RoutePlannerCard'

const DAY_PRESETS = [1, 2, 3, 4, 5]
const HOUR_PRESETS = [0, 4, 6, 8, 12]

export default function InterCityForm({ config, onChange }) {
  const minDur = getMinDurationForConfig(config)
  const ic = config.interCityDetails ?? {}
  const days = ic.days ?? 1
  const hours = ic.hours ?? 0
  const totalHours = days * 24 + hours

  const patchIC = (patch) =>
    onChange({
      ...config,
      interCityDetails: { ...ic, ...patch },
      ...(patch.destinationId ? { interCityDestination: patch.destinationId } : {}),
      ...(patch.days != null ? { interCityDays: patch.days } : {}),
    })

  const setDays = (d) => patchIC({ days: Math.max(0, d) })
  const setHours = (h) => patchIC({ hours: Math.max(0, Math.min(23, h)) })

  // Auto-clamp duration to minimum required travel time
  useEffect(() => {
    if (totalHours < minDur.minHours) {
      if (minDur.minHours >= 24) {
        const reqDays = Math.ceil(minDur.minHours / 24)
        patchIC({ days: reqDays, hours: 0 })
      } else if (days === 0) {
        patchIC({ hours: minDur.minHours })
      }
    }
  }, [
    minDur.minHours,
    config.interCityDetails?.destinationId,
    config.interCityDestination,
    config.interCityDetails?.stops,
    config.interCityDetails?.returnStops,
    config.tripType,
  ])

  const canDecDays = days > 0 && (days - 1) * 24 + hours >= minDur.minHours
  const canDecHours = hours > 0 && days * 24 + (hours - 1) >= minDur.minHours

  return (
    <View style={{ gap: space.md }}>
      {/* Route Planner */}
      <RoutePlannerCard config={config} onChange={onChange} isInterCity />

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
              TRIP DURATION (DAYS + HOURS)
            </Text>
          </View>
        </View>

        {/* Min requirement notice */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space.sm,
            backgroundColor: colors.blueSoft,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: '#bfdbfe',
            padding: space.sm,
          }}
        >
          <Info size={15} color={colors.blue} style={{ marginTop: 1 }} />
          <Text style={{ ...type.tiny, color: '#1e3a5f', flex: 1 }}>
            <Text style={{ fontWeight: '800' }}>Travel Requirement: </Text>
            {minDur.label}
          </Text>
        </View>

        {/* Days row */}
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ ...type.caption, color: colors.text, fontWeight: '800' }}>Days:</Text>
            <Text style={{ ...type.caption, color: colors.brand, fontWeight: '900' }}>
              {days} {days === 1 ? 'Day' : 'Days'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              {DAY_PRESETS.map((d) => {
                const belowMin = d * 24 + hours < minDur.minHours
                const active = days === d
                return (
                  <Pressable
                    key={d}
                    onPress={() => !belowMin && setDays(d)}
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
                    <Text style={{ ...type.micro, color: active ? colors.brand : belowMin ? colors.textFaint : colors.text, fontWeight: '800' }}>
                      {d}{d === 1 ? 'D' : 'D'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
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
                onPress={() => setDays(days - 1)}
                disabled={!canDecDays}
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', opacity: canDecDays ? 1 : 0.3 }}
              >
                <Minus size={13} color={colors.textMuted} />
              </Pressable>
              <Text style={{ width: 28, textAlign: 'center', ...type.bodyBold, color: colors.text }}>
                {days}d
              </Text>
              <Pressable
                onPress={() => setDays(Math.min(30, days + 1))}
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={13} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Extra Hours row */}
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ ...type.caption, color: colors.text, fontWeight: '800' }}>+ Extra Hours:</Text>
            <Text style={{ ...type.caption, color: colors.brand, fontWeight: '900' }}>
              {hours} {hours === 1 ? 'Hour' : 'Hours'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              {HOUR_PRESETS.map((h) => {
                const belowMin = days * 24 + h < minDur.minHours
                const active = hours === h
                return (
                  <Pressable
                    key={h}
                    onPress={() => !belowMin && setHours(h)}
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
                    <Text style={{ ...type.micro, color: active ? colors.brand : belowMin ? colors.textFaint : colors.text, fontWeight: '800' }}>
                      {h}h
                    </Text>
                  </Pressable>
                )
              })}
            </View>
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
                onPress={() => setHours(hours - 1)}
                disabled={!canDecHours}
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', opacity: canDecHours ? 1 : 0.3 }}
              >
                <Minus size={13} color={colors.textMuted} />
              </Pressable>
              <Text style={{ width: 28, textAlign: 'center', ...type.bodyBold, color: colors.text }}>
                {hours}h
              </Text>
              <Pressable
                onPress={() => setHours(Math.min(23, hours + 1))}
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={13} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Total Duration Banner */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.brandSoft,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: '#fca5a5',
            paddingHorizontal: space.md,
            paddingVertical: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color={colors.brand} />
            <Text style={{ ...type.caption, color: colors.brandPressed, fontWeight: '800' }}>
              Total Duration:
            </Text>
          </View>
          <Text style={{ ...type.body, color: colors.brandPressed, fontWeight: '900' }}>
            {days > 0 && hours > 0
              ? `${days} Day${days > 1 ? 's' : ''} ${hours} Hr${hours > 1 ? 's' : ''} (${totalHours}h)`
              : days > 0
              ? `${days} Day${days > 1 ? 's' : ''} (${totalHours}h)`
              : `${Math.max(4, hours)} Hours`}
          </Text>
        </View>
      </View>
    </View>
  )
}
