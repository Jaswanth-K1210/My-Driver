/**
 * WithinCityForm — route planner + duration picker for "Within City" trips.
 */
import { useEffect } from 'react'
import { View } from 'react-native'
import { getMinDurationForConfig } from '../../../lib/booking'
import { space } from '../../../theme/tokens'
import { Chip, Notice, Panel, StepperRow } from '../../../components/Form'
import RoutePlannerCard from './RoutePlannerCard'

const DURATION_PRESETS = [2, 4, 8, 12]

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
      <Panel>
        <StepperRow
          label="Duration"
          value={`${config.durationHours} ${config.durationHours === 1 ? 'hr' : 'hrs'}`}
          onDec={() => setDuration(Math.max(minDur.minHours, config.durationHours - 1))}
          onInc={() => setDuration(Math.min(24, config.durationHours + 1))}
          canDec={config.durationHours > minDur.minHours}
          canInc={config.durationHours < 24}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {DURATION_PRESETS.map((h) => (
            <Chip
              key={h}
              label={`${h} ${h === 1 ? 'hr' : 'hrs'}`}
              active={config.durationHours === h}
              disabled={h < minDur.minHours}
              onPress={() => setDuration(h)}
            />
          ))}
        </View>
        {minDur.minHours > 1 ? <Notice>{minDur.label}</Notice> : null}
      </Panel>
    </View>
  )
}
