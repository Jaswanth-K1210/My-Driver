/**
 * InterCityForm — outstation route planner + day/hour duration picker.
 */
import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { getMinDurationForConfig } from '../../../lib/booking'
import { colors, space, type } from '../../../theme/tokens'
import { Notice, Panel, StepperRow } from '../../../components/Form'
import RoutePlannerCard from './RoutePlannerCard'

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
      <Panel>
        <StepperRow
          label="Days"
          value={`${days} ${days === 1 ? 'day' : 'days'}`}
          onDec={() => setDays(days - 1)}
          onInc={() => setDays(Math.min(30, days + 1))}
          canDec={canDecDays}
          canInc={days < 30}
        />
        <StepperRow
          label="Extra hours"
          value={`${hours} ${hours === 1 ? 'hr' : 'hrs'}`}
          onDec={() => setHours(hours - 1)}
          onInc={() => setHours(Math.min(23, hours + 1))}
          canDec={canDecHours}
          canInc={hours < 23}
        />
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: space.md,
          }}
        >
          <Text style={{ ...type.caption, color: colors.textMuted }}>Total</Text>
          <Text style={{ ...type.bodyBold, color: colors.text }}>
            {days > 0 && hours > 0
              ? `${days} day${days > 1 ? 's' : ''} ${hours} hr${hours > 1 ? 's' : ''} · ${totalHours}h`
              : days > 0
                ? `${days} day${days > 1 ? 's' : ''} · ${totalHours}h`
                : `${Math.max(4, hours)} hrs`}
          </Text>
        </View>
        <Notice>{minDur.label}</Notice>
      </Panel>
    </View>
  )
}
