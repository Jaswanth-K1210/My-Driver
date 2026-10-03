/**
 * AirportForm — departure/arrival toggle, terminal selector, round-trip, flight number.
 */
import { Pressable, Text, TextInput, View } from 'react-native'
import { Plane } from 'lucide-react-native'
import { AIRPORT_LOCATIONS } from '../../../data/mock'
import { colors, radius, space, type } from '../../../theme/tokens'
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
    <View style={{ gap: space.md }}>
      {/* Flow + Trip-Type toggles */}
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {/* Departure / Arrival */}
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5, marginBottom: space.sm }}>
            TRANSFER TYPE
          </Text>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.md,
              padding: 3,
            }}
          >
            {[
              { id: 'departure', label: '🛫 Departure' },
              { id: 'arrival', label: '🛬 Arrival' },
            ].map((opt) => {
              const active = ad.flow === opt.id
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => patchAD({ flow: opt.id })}
                  style={{
                    flex: 1,
                    paddingVertical: 7,
                    alignItems: 'center',
                    borderRadius: radius.md - 2,
                    backgroundColor: active ? colors.surface : 'transparent',
                    elevation: active ? 1 : 0,
                  }}
                >
                  <Text style={{ ...type.caption, color: active ? colors.text : colors.textMuted, fontWeight: active ? '800' : '600' }}>
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* One-way / Round-trip */}
        <View style={{ flex: 1, minWidth: 140 }}>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5, marginBottom: space.sm }}>
            ROUTE TYPE
          </Text>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.md,
              padding: 3,
            }}
          >
            {[
              { id: 'one_way', label: 'One Way' },
              { id: 'two_way', label: 'Round Trip' },
            ].map((opt) => {
              const active = config.tripType === opt.id
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setTripType(opt.id)}
                  style={{
                    flex: 1,
                    paddingVertical: 7,
                    alignItems: 'center',
                    borderRadius: radius.md - 2,
                    backgroundColor: active ? colors.surface : 'transparent',
                    elevation: active ? 1 : 0,
                  }}
                >
                  <Text style={{ ...type.caption, color: active ? colors.text : colors.textMuted, fontWeight: active ? '800' : '600' }}>
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>

      {/* Terminal Selector */}
      <View>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5, marginBottom: space.sm }}>
          AIRPORT TERMINAL
        </Text>
        <ModalPicker
          value={ad.terminalId}
          options={TERMINAL_OPTS}
          onChange={(id) => patchAD({ terminalId: id })}
          placeholder="Select airport terminal"
          title="Airport Terminal"
        />
      </View>

      {/* Flight Number */}
      <View>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5, marginBottom: space.sm }}>
          FLIGHT NUMBER{' '}
          <Text style={{ fontWeight: '600', letterSpacing: 0 }}>
            (Optional — for automated flight tracking)
          </Text>
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
            <Plane size={15} color={colors.textMuted} />
          </View>
          <TextInput
            value={ad.flightNumber}
            onChangeText={(v) => patchAD({ flightNumber: v.toUpperCase() })}
            placeholder="e.g. 6E-2415 / AI-840"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={{
              paddingLeft: 40,
              paddingRight: space.md,
              paddingVertical: 11,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              fontSize: 14,
              fontWeight: '700',
              color: colors.text,
              letterSpacing: 0.5,
            }}
          />
        </View>
      </View>
    </View>
  )
}
