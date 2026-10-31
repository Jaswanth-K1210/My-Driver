/**
 * AirportForm — departure/arrival toggle, terminal selector, round-trip, flight number.
 */
import { TextInput, View } from 'react-native'
import { Plane } from 'lucide-react-native'
import { AIRPORT_LOCATIONS } from '../../../data/mock'
import { colors, radius, space, type } from '../../../theme/tokens'
import { FieldLabel, Segmented } from '../../../components/Form'
import ModalPicker from './ModalPicker'

const TERMINAL_OPTS = AIRPORT_LOCATIONS.map((a) => ({
  id: a.id,
  label: a.name,
  sublabel: `~${a.distanceKm} km from city · ${a.address}`,
}))

export default function AirportForm({ config, onChange }) {
  const ad = config.airportDetails ?? { terminalId: AIRPORT_LOCATIONS[0].id, flow: 'departure', flightNumber: '' }

  const patchAD = (patch) =>
    onChange({ ...config, airportDetails: { ...ad, ...patch } })

  const setTripType = (t) => onChange({ ...config, tripType: t })

  return (
    <View style={{ gap: space.lg }}>
      <View>
        <FieldLabel>Transfer</FieldLabel>
        <Segmented
          options={[
            { id: 'departure', label: 'To airport' },
            { id: 'arrival', label: 'From airport' },
          ]}
          value={ad.flow}
          onChange={(flow) => patchAD({ flow })}
        />
      </View>

      <View>
        <FieldLabel>Route</FieldLabel>
        <Segmented
          options={[
            { id: 'one_way', label: 'One way' },
            { id: 'two_way', label: 'Round trip' },
          ]}
          value={config.tripType}
          onChange={setTripType}
        />
      </View>

      <View>
        <FieldLabel>Terminal</FieldLabel>
        <ModalPicker
          value={ad.terminalId}
          options={TERMINAL_OPTS}
          onChange={(id) => patchAD({ terminalId: id })}
          placeholder="Select airport terminal"
          title="Airport terminal"
        />
      </View>

      <View>
        <FieldLabel hint="Optional · we track delays for you">Flight number</FieldLabel>
        <View style={{ justifyContent: 'center' }}>
          <View style={{ position: 'absolute', left: space.md, zIndex: 1 }}>
            <Plane size={16} color={colors.textMuted} />
          </View>
          <TextInput
            accessibilityLabel="Flight number"
            value={ad.flightNumber}
            onChangeText={(v) => patchAD({ flightNumber: v.toUpperCase() })}
            placeholder="e.g. 6E-2415"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
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
              letterSpacing: 0.5,
            }}
          />
        </View>
      </View>
    </View>
  )
}
