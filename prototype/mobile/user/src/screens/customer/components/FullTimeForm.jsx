/**
 * FullTimeForm — full-time driver contract configuration.
 * Locality input + Days/Weeks/Months unit selector + count stepper + policy notice.
 */
import { TextInput, View } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { colors, radius, space, type } from '../../../theme/tokens'
import { FieldLabel, Notice, Panel, Segmented, StepperRow } from '../../../components/Form'

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
    <View style={{ gap: space.lg }}>
      <View>
        <FieldLabel>Area</FieldLabel>
        <View style={{ justifyContent: 'center' }}>
          <View style={{ position: 'absolute', left: space.md, zIndex: 1 }}>
            <MapPin size={16} color={colors.textMuted} />
          </View>
          <TextInput
            accessibilityLabel="Area where the driver will work"
            value={ft.locality}
            onChangeText={(v) => patchFT({ locality: v })}
            placeholder="e.g. HITEC City, Jubilee Hills"
            placeholderTextColor={colors.textMuted}
            style={{
              ...type.body,
              paddingLeft: 40,
              paddingRight: space.md,
              paddingVertical: 13,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.text,
            }}
          />
        </View>
      </View>

      <View>
        <FieldLabel>Contract length</FieldLabel>
        <Panel>
          <Segmented
            options={DURATION_UNITS.map((u) => ({ id: u, label: u[0].toUpperCase() + u.slice(1) }))}
            value={ft.durationUnit}
            onChange={(u) => patchFT({ durationUnit: u })}
          />
          <StepperRow
            label={`Number of ${ft.durationUnit}`}
            value={String(ft.durationCount)}
            onDec={() => setCount(ft.durationCount - 1)}
            onInc={() => setCount(ft.durationCount + 1)}
            canDec={ft.durationCount > 1}
          />
        </Panel>
      </View>

      <Notice>
        Up to 12 working hours a day are included. Extra hours are billed at ₹150 / hour.
      </Notice>
    </View>
  )
}
