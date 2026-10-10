/**
 * FullTimeForm — full-time driver contract configuration.
 * Locality input + Days/Weeks/Months unit selector + count stepper + policy notice.
 */
import { Pressable, Text, TextInput, View } from 'react-native'
import { Info, MapPin, Minus, Plus } from 'lucide-react-native'
import { colors, radius, space, type } from '../../../theme/tokens'

const DURATION_UNITS = ['days', 'weeks', 'months']

export default function FullTimeForm({ config, onChange }) {
  const ft = config.fullTimeDetails ?? {
    locality: '',
    durationUnit: 'months',
    durationCount: 1,
    workingHoursPerDay: 12,
    overtimeRatePerHour: 150,
  }

  const patchFT = (patch) =>
    onChange({ ...config, fullTimeDetails: { ...ft, ...patch } })

  const setCount = (n) => patchFT({ durationCount: Math.max(1, n) })

  return (
    <View style={{ gap: space.md }}>
      {/* Locality */}
      <View>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5, marginBottom: space.sm }}>
          PRIMARY LOCALITY / OPERATIONAL AREA
        </Text>
        <View style={{ position: 'relative' }}>
          <View
            style={{
              position: 'absolute',
              left: space.md,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <MapPin size={15} color={colors.textMuted} />
          </View>
          <TextInput
            value={ft.locality}
            onChangeText={(v) => patchFT({ locality: v })}
            placeholder="e.g. HITEC City, Jubilee Hills, Gachibowli"
            placeholderTextColor={colors.textMuted}
            style={{
              paddingLeft: 40,
              paddingRight: space.md,
              paddingVertical: 11,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              fontSize: 14,
              fontWeight: '600',
              color: colors.text,
            }}
          />
        </View>
      </View>

      {/* Contract Duration */}
      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceAlt,
          padding: space.md,
          gap: space.md,
        }}
      >
        {/* Unit selector */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5 }}>
            CONTRACT DURATION
          </Text>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.border,
              borderRadius: radius.md,
              padding: 3,
            }}
          >
            {DURATION_UNITS.map((unit) => {
              const active = ft.durationUnit === unit
              return (
                <Pressable
                  key={unit}
                  onPress={() => patchFT({ durationUnit: unit })}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: radius.md - 2,
                    backgroundColor: active ? colors.surface : 'transparent',
                    elevation: active ? 1 : 0,
                  }}
                >
                  <Text
                    style={{
                      ...type.caption,
                      color: active ? colors.text : colors.textMuted,
                      fontWeight: active ? '800' : '600',
                      textTransform: 'capitalize',
                    }}
                  >
                    {unit}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Count stepper */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
          }}
        >
          <Text style={{ ...type.body, color: colors.text }}>
            Number of {ft.durationUnit}:
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Pressable
              onPress={() => setCount(ft.durationCount - 1)}
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Minus size={14} color={colors.text} />
            </Pressable>
            <Text style={{ ...type.title, color: colors.text, minWidth: 28, textAlign: 'center' }}>
              {ft.durationCount}
            </Text>
            <Pressable
              onPress={() => setCount(ft.durationCount + 1)}
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={14} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Policy notice */}
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
          <Text style={{ ...type.tiny, color: colors.text, flex: 1 }}>
            <Text style={{ fontWeight: '800' }}>12 Hours / Day Regular Baseline: </Text>
            Full-time drivers are assigned for up to 12 working hours daily. Any additional duty hour is billed transparently at{' '}
            <Text style={{ fontWeight: '800' }}>₹150 / hour</Text> overtime.
          </Text>
        </View>
      </View>
    </View>
  )
}
