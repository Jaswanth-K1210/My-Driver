/**
 * RoutePlannerCard — the shared visual route planner for Within-City and Inter-City modes.
 *
 * Features:
 *   • One-Way / Round-Trip direction toggle
 *   • Outbound leg: pickup → up to 3 intermediate stops → destination
 *   • Visual timeline: pickup → stops → drop, with labels inside each field
 *   • Distance + estimated drive time under each leg
 *   • Return leg card (only when Round Trip selected)
 *   • Round-trip total line
 *
 * Props:
 *   config          — full trip config
 *   onChange        — (newConfig) => void
 *   isInterCity     — if true, destination picker uses INTERCITY_DESTINATIONS; affects speed for ETA
 */
import { Pressable, Text, View } from 'react-native'
import { Clock, Navigation, Plus, X } from 'lucide-react-native'
import {
  CITY_LOCATIONS,
  INTERCITY_DESTINATIONS,
  START_LOCATIONS,
} from '../../../data/mock'
import { getRouteLegTelemetry, getLocationById } from '../../../lib/booking'
import { colors, radius, space, type } from '../../../theme/tokens'
import { Panel, Segmented } from '../../../components/Form'
import ModalPicker from './ModalPicker'

/* ── helpers ─────────────────────────────────────────────────────────────── */

const CITY_OPTS = CITY_LOCATIONS.map((l) => ({
  id: l.id,
  label: l.name,
  sublabel: l.address,
}))

const INTERCITY_OPTS = INTERCITY_DESTINATIONS.map((d) => ({
  id: d.id,
  label: d.name,
  sublabel: `${d.state} · ~${d.distanceKm} km · ~${d.estHours} hrs drive`,
}))

const START_OPTS = START_LOCATIONS.map((l) => ({
  id: l.id,
  label: l.name,
  sublabel: l.address,
}))

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h} hr${h > 1 ? 's' : ''} ${m} mins`
  if (h > 0) return `${h} hr${h > 1 ? 's' : ''}`
  return `${m} mins`
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

/**
 * One row of the route timeline: a marker on the left, the field on the right,
 * and a connector running down to the next row's marker. The connector is
 * absolutely positioned so it bridges the gap between rows exactly.
 */
function TimelineRow({ marker = 'stop', isLast = false, children }) {
  const markerStyle =
    marker === 'pickup'
      ? { borderRadius: 6, backgroundColor: colors.surface, borderColor: colors.graphite }
      : marker === 'drop'
        ? { borderRadius: 2, backgroundColor: colors.red, borderColor: colors.red }
        : { borderRadius: 6, backgroundColor: colors.borderStrong, borderColor: colors.borderStrong }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: isLast ? 0 : space.sm }}>
      <View style={{ width: 20, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
        <View style={[{ width: 12, height: 12, borderWidth: 2.5 }, markerStyle]} />
        {!isLast && (
          <View
            style={{
              position: 'absolute',
              top: '50%',
              marginTop: 10,
              bottom: -space.sm - 20,
              width: 2,
              borderRadius: 1,
              backgroundColor: colors.border,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md }}>
        {children}
      </View>
    </View>
  )
}

function StopRemoveButton({ onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      })}
      accessibilityLabel="Remove stop"
    >
      <X size={16} color={colors.textMuted} />
    </Pressable>
  )
}

function AddStopButton({ onPress, enabled, count, label = 'Add stop' }) {
  return (
    <View style={{ paddingLeft: 32, paddingTop: space.xs, paddingBottom: space.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !enabled }}
        onPress={onPress}
        disabled={!enabled}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
      >
        <Plus size={15} color={enabled ? colors.brand : colors.textMuted} />
        <Text style={{ ...type.caption, color: enabled ? colors.brand : colors.textMuted }}>
          {label}
          {count > 0 ? ` · ${count}/3` : ''}
        </Text>
      </Pressable>
      {!enabled && count > 0 && count < 3 ? (
        <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 4 }}>
          Choose a place for the last stop first
        </Text>
      ) : null}
    </View>
  )
}

/** Distance + time for one leg, as a quiet line under the route. */
function TelemetryLine({ telemetry }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.lg,
        marginTop: space.md,
        paddingTop: space.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Navigation size={14} color={colors.textMuted} />
        <Text style={{ ...type.caption, color: colors.text }}>~{telemetry.distanceKm} km</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Clock size={14} color={colors.textMuted} />
        <Text style={{ ...type.caption, color: colors.text }}>~{telemetry.formattedDuration}</Text>
      </View>
      <Text style={{ ...type.tiny, color: colors.textMuted, marginLeft: 'auto' }}>{telemetry.tag}</Text>
    </View>
  )
}

/** Small heading shown above each leg in round-trip mode. */
function LegHeading({ children, meta }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
      <Text style={{ ...type.bodyBold, color: colors.text }}>{children}</Text>
      {meta ? <Text style={{ ...type.tiny, color: colors.textMuted }}>{meta}</Text> : null}
    </View>
  )
}

/* ── Main Component ──────────────────────────────────────────────────────── */

export default function RoutePlannerCard({ config, onChange, isInterCity = false }) {
  const isTwoWay = config.tripType === 'two_way'

  // ── State extraction ──
  const stops = isInterCity
    ? config.interCityDetails?.stops ?? []
    : config.stops ?? []

  const returnStops = isInterCity
    ? config.interCityDetails?.returnStops ?? []
    : config.returnStops ?? []

  const pickupId = isInterCity
    ? config.interCityDetails?.startLocationId ?? 'start_hitec'
    : config.pickupId ?? 'start_hitec'

  const dropId = isInterCity
    ? config.interCityDetails?.destinationId ?? config.interCityDestination ?? 'vijayawada'
    : config.dropId ?? 'gachibowli'

  const rawReturnDropId = isInterCity
    ? config.interCityDetails?.returnDropId
    : config.returnDropId

  const returnDropId =
    rawReturnDropId && rawReturnDropId !== 'same_as_pickup' ? rawReturnDropId : pickupId

  // ── Derived data ──
  const destOptions = isInterCity ? INTERCITY_OPTS : CITY_OPTS
  const pickupOptions = isInterCity ? START_OPTS : CITY_OPTS

  const destObj = getLocationById(dropId)
  const destName = destObj?.name ?? 'Destination'

  // ── State updaters ──
  const patch = (updates) => {
    if (isInterCity) {
      let legacyPatch = {}
      if (updates.destinationId) legacyPatch.interCityDestination = updates.destinationId
      onChange({
        ...config,
        interCityDetails: { ...config.interCityDetails, ...updates },
        ...legacyPatch,
      })
    } else {
      onChange({ ...config, ...updates })
    }
  }

  const setTripType = (tripType) => onChange({ ...config, tripType })

  const handlePickupChange = (newId) => {
    const currentReturn = isInterCity
      ? config.interCityDetails?.returnDropId
      : config.returnDropId
    const shouldSyncReturn =
      !currentReturn || currentReturn === 'same_as_pickup' || currentReturn === pickupId
    if (isInterCity) {
      patch({ startLocationId: newId, ...(shouldSyncReturn ? { returnDropId: newId } : {}) })
    } else {
      patch({ pickupId: newId, ...(shouldSyncReturn ? { returnDropId: newId } : {}) })
    }
  }

  // Outbound stop management
  const addStop = () => {
    if (stops.length >= 3) return
    patch({ stops: [...stops, { id: Math.random().toString(36).slice(2), locationId: '' }] })
  }
  const removeStop = (id) => patch({ stops: stops.filter((s) => s.id !== id) })
  const updateStop = (id, locationId) =>
    patch({ stops: stops.map((s) => (s.id === id ? { ...s, locationId } : s)) })

  // Return stop management
  const addReturnStop = () => {
    if (returnStops.length >= 3) return
    patch({ returnStops: [...returnStops, { id: Math.random().toString(36).slice(2), locationId: '' }] })
  }
  const removeReturnStop = (id) =>
    patch({ returnStops: returnStops.filter((s) => s.id !== id) })
  const updateReturnStop = (id, locationId) =>
    patch({ returnStops: returnStops.map((s) => (s.id === id ? { ...s, locationId } : s)) })

  // Destination change
  const handleDestChange = (id) =>
    patch(isInterCity ? { destinationId: id } : { dropId: id })

  // Return drop change
  const handleReturnDropChange = (id) =>
    patch({ returnDropId: id })

  // ── Can add stops? Only if all existing stops have a location selected ──
  const canAddStop = stops.length < 3 && (stops.length === 0 || stops.every((s) => s.locationId !== ''))
  const canAddReturnStop =
    returnStops.length < 3 &&
    (returnStops.length === 0 || returnStops.every((s) => s.locationId !== ''))

  // ── Live telemetry ──
  const outboundTelemetry = getRouteLegTelemetry(pickupId, stops, dropId, isInterCity)
  const returnTelemetry = isTwoWay
    ? getRouteLegTelemetry(dropId, returnStops, returnDropId, isInterCity)
    : null

  const totalKm = outboundTelemetry.distanceKm + (returnTelemetry?.distanceKm ?? 0)
  const totalMinutes =
    outboundTelemetry.durationMinutes + (returnTelemetry?.durationMinutes ?? 0)

  return (
    <View style={{ gap: space.md }}>
      {/* ── Direction Toggle ── */}
      <Segmented
        options={[
          { id: 'one_way', label: 'One way' },
          { id: 'two_way', label: 'Round trip' },
        ]}
        value={config.tripType}
        onChange={setTripType}
      />

      {/* ── Card 1: Outbound Leg ── */}
      <Panel style={{ gap: 0 }}>
        {isTwoWay ? (
          <LegHeading meta={stops.length > 0 ? `${stops.length} stop${stops.length > 1 ? 's' : ''}` : 'Direct'}>
            Going
          </LegHeading>
        ) : null}

        {/* Pickup */}
        <TimelineRow marker="pickup">
          <View style={{ flex: 1 }}>
            <ModalPicker
              label="Pickup"
              value={pickupId}
              options={pickupOptions}
              onChange={handlePickupChange}
              placeholder="Select pickup location"
              title="Pickup location"
              searchable
              placeSearch
            />
          </View>
        </TimelineRow>

        {/* Outbound Stops */}
        {stops.map((stop, i) => (
          <TimelineRow key={stop.id} marker="stop">
            <View style={{ flex: 1 }}>
              <ModalPicker
                label={`Stop ${i + 1}`}
                value={stop.locationId}
                options={CITY_OPTS}
                onChange={(id) => updateStop(stop.id, id)}
                placeholder="Choose a place"
                title={`Stop ${i + 1}`}
                searchable
                placeSearch
              />
            </View>
            <StopRemoveButton onPress={() => removeStop(stop.id)} />
          </TimelineRow>
        ))}

        {/* Outbound Destination */}
        <TimelineRow marker="drop" isLast>
          <View style={{ flex: 1 }}>
            <ModalPicker
              label={isTwoWay ? 'Turnaround point' : 'Drop'}
              value={dropId}
              options={destOptions}
              onChange={handleDestChange}
              placeholder="Select destination"
              title="Destination"
              searchable
              placeSearch
            />
          </View>
        </TimelineRow>

        <AddStopButton onPress={addStop} enabled={canAddStop} count={stops.length} />

        <TelemetryLine telemetry={outboundTelemetry} />
      </Panel>

      {/* ── Card 2: Return Leg (only in Round Trip) ── */}
      {isTwoWay && (
        <Panel style={{ gap: 0 }}>
          <LegHeading meta={`From ${destName.split(',')[0]}`}>Return</LegHeading>

          {/* Return Origin (locked) */}
          <TimelineRow marker="pickup">
            <View
              style={{
                flex: 1,
                paddingHorizontal: space.md,
                paddingVertical: 9,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <Text style={{ ...type.tiny, color: colors.textMuted }}>Starts from your turnaround point</Text>
              <Text style={{ ...type.body, color: colors.textMuted }} numberOfLines={1}>
                {destName}
              </Text>
            </View>
          </TimelineRow>

          {/* Return Stops */}
          {returnStops.map((stop, i) => (
            <TimelineRow key={stop.id} marker="stop">
              <View style={{ flex: 1 }}>
                <ModalPicker
                  label={`Return stop ${i + 1}`}
                  value={stop.locationId}
                  options={CITY_OPTS}
                  onChange={(id) => updateReturnStop(stop.id, id)}
                  placeholder="Choose a place"
                  title={`Return stop ${i + 1}`}
                  searchable
                  placeSearch
                />
              </View>
              <StopRemoveButton onPress={() => removeReturnStop(stop.id)} />
            </TimelineRow>
          ))}

          {/* Final Return Destination */}
          <TimelineRow marker="drop" isLast>
            <View style={{ flex: 1 }}>
              <ModalPicker
                label={returnDropId === pickupId ? 'Drop · same as pickup' : 'Drop'}
                value={returnDropId}
                options={CITY_OPTS.map((l) => ({
                  ...l,
                  sublabel: l.id === pickupId ? `Your pickup · ${l.sublabel}` : l.sublabel,
                }))}
                onChange={handleReturnDropChange}
                placeholder="Select return destination"
                title="Return drop"
                searchable
                placeSearch
              />
            </View>
          </TimelineRow>

          <AddStopButton
            onPress={addReturnStop}
            enabled={canAddReturnStop}
            count={returnStops.length}
            label="Add return stop"
          />

          <TelemetryLine telemetry={returnTelemetry} />
        </Panel>
      )}

      {/* ── Round Trip Summary ── */}
      {isTwoWay && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.md,
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
            gap: space.md,
          }}
        >
          <Text style={{ ...type.caption, color: colors.textMuted }}>
            Round trip total
            {stops.length + returnStops.length > 0 ? ` · ${stops.length + returnStops.length} stops` : ''}
          </Text>
          <Text style={{ ...type.bodyBold, color: colors.text }}>
            ~{totalKm} km · ~{formatDuration(totalMinutes)}
          </Text>
        </View>
      )}
    </View>
  )
}
