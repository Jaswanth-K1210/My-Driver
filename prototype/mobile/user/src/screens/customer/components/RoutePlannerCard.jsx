/**
 * RoutePlannerCard — the shared visual route planner for Within-City and Inter-City modes.
 *
 * Features:
 *   • One-Way / Round-Trip direction toggle
 *   • Outbound leg: pickup → up to 3 intermediate stops → destination
 *   • Visual timeline with dots + connector lines (no z-index glitches)
 *   • Live telemetry footer: distance + estimated drive time
 *   • Return leg card (only when Round Trip selected)
 *   • Total round-trip summary banner
 *
 * Props:
 *   config          — full trip config
 *   onChange        — (newConfig) => void
 *   isInterCity     — if true, destination picker uses INTERCITY_DESTINATIONS; affects speed for ETA
 */
import { Pressable, Text, View } from 'react-native'
import { Clock, Compass, Minus, Navigation, Plus } from 'lucide-react-native'
import {
  CITY_LOCATIONS,
  INTERCITY_DESTINATIONS,
  START_LOCATIONS,
} from '../../../data/mock'
import { getRouteLegTelemetry, getLocationById } from '../../../lib/booking'
import { colors, radius, space, type } from '../../../theme/tokens'
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

/** One row of the route timeline (dot + optional connector line + content). */
function TimelineRow({ dotColor = colors.textFaint, dotBorder = colors.surfaceSunken, isLast = false, lineColor = colors.border, children }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      {/* Left: dot + connector */}
      <View style={{ width: 22, alignItems: 'center' }}>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: dotColor,
            borderWidth: 3,
            borderColor: dotBorder,
            marginTop: 13,
          }}
        />
        {!isLast && (
          <View
            style={{
              flex: 1,
              width: 2,
              backgroundColor: lineColor,
              marginTop: 3,
              minHeight: 12,
            }}
          />
        )}
      </View>
      {/* Right: content */}
      <View style={{ flex: 1, paddingLeft: 10, paddingBottom: isLast ? 0 : 14 }}>
        {children}
      </View>
    </View>
  )
}

function RowLabel({ children }) {
  return (
    <Text
      style={{
        ...type.micro,
        color: colors.textMuted,
        letterSpacing: 0.5,
        marginBottom: 4,
      }}
    >
      {String(children).toUpperCase()}
    </Text>
  )
}

function StopRemoveButton({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: pressed ? '#fca5a5' : colors.border,
        backgroundColor: pressed ? colors.redSofter : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      })}
      accessibilityLabel="Remove stop"
    >
      <Minus size={14} color={colors.textMuted} />
    </Pressable>
  )
}

function TelemetryFooter({ telemetry, style }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: 10,
          marginTop: space.sm,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Navigation size={13} color={colors.graphite} style={{ transform: [{ rotate: '45deg' }] }} />
          <Text style={{ ...type.caption, color: colors.text, fontWeight: '800' }}>
            ~{telemetry.distanceKm} km
          </Text>
        </View>
        <Text style={{ color: colors.border, fontSize: 10 }}>|</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Clock size={13} color={colors.brand} />
          <Text style={{ ...type.caption, color: colors.text, fontWeight: '800' }}>
            ~{telemetry.formattedDuration}
          </Text>
        </View>
      </View>
      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}
      >
        <Text style={{ ...type.micro, color: colors.graphite }}>{telemetry.tag}</Text>
      </View>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5 }}>
          TRIP DIRECTION
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
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: radius.md - 2,
                  backgroundColor: active ? colors.surface : 'transparent',
                  shadowColor: active ? '#000' : 'transparent',
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: active ? 1 : 0,
                }}
              >
                <Text style={{ ...type.caption, color: active ? colors.text : colors.textMuted }}>
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* ── Card 1: Outbound Leg ── */}
      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.md,
          gap: 0,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: space.sm,
            marginBottom: space.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.graphite }} />
            <Text style={{ ...type.micro, color: colors.graphite, letterSpacing: 0.5, fontWeight: '900' }}>
              {isTwoWay ? 'LEG 1: OUTBOUND' : 'JOURNEY ROUTE'}
            </Text>
          </View>
          <Text style={{ ...type.micro, color: colors.textMuted }}>
            {stops.length > 0 ? `${stops.length} stop${stops.length > 1 ? 's' : ''}` : 'Direct'}
          </Text>
        </View>

        {/* Pickup */}
        <TimelineRow dotColor={colors.graphite} dotBorder={colors.surfaceSunken} isLast={false}>
          <RowLabel>Pickup (From)</RowLabel>
          <ModalPicker
            value={pickupId}
            options={pickupOptions}
            onChange={handlePickupChange}
            placeholder="Select pickup location"
            title="Pickup Location"
            searchable
            placeSearch
          />
        </TimelineRow>

        {/* Outbound Stops */}
        {stops.map((stop, i) => (
          <TimelineRow
            key={stop.id}
            dotColor={colors.textFaint}
            dotBorder={colors.surfaceSunken}
            isLast={false}
          >
            <RowLabel>Stop {i + 1}</RowLabel>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <ModalPicker
                  value={stop.locationId}
                  options={CITY_OPTS}
                  onChange={(id) => updateStop(stop.id, id)}
                  placeholder={`Select stop ${i + 1}…`}
                  title={`Stop ${i + 1}`}
                  searchable
                  placeSearch
                />
              </View>
              <StopRemoveButton onPress={() => removeStop(stop.id)} />
            </View>
          </TimelineRow>
        ))}

        {/* Add Stop */}
        <View style={{ paddingLeft: 32, marginBottom: space.sm }}>
          <Pressable
            onPress={addStop}
            disabled={!canAddStop}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <Plus size={13} color={canAddStop ? colors.brand : colors.textFaint} />
            <Text
              style={{
                ...type.caption,
                color: canAddStop ? colors.brand : colors.textFaint,
                fontWeight: '800',
              }}
            >
              Add Stop {stops.length > 0 ? `(${stops.length}/3)` : ''}
            </Text>
          </Pressable>
          {!canAddStop && stops.length > 0 && stops.length < 3 ? (
            <Text style={{ ...type.micro, color: colors.textMuted, marginTop: 3 }}>
              Select a location above first
            </Text>
          ) : null}
        </View>

        {/* Outbound Destination */}
        <TimelineRow
          dotColor={colors.graphite}
          dotBorder={colors.surfaceAlt}
          isLast
        >
          <RowLabel>{isTwoWay ? 'Turnaround (Outbound Destination)' : 'Destination (To)'}</RowLabel>
          <ModalPicker
            value={dropId}
            options={destOptions}
            onChange={handleDestChange}
            placeholder="Select destination"
            title="Destination"
            searchable
            placeSearch
          />
        </TimelineRow>

        {/* Outbound Telemetry */}
        <TelemetryFooter telemetry={outboundTelemetry} />
      </View>

      {/* ── Card 2: Return Leg (only in Round Trip) ── */}
      {isTwoWay && (
        <View
          style={{
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.brandSoft,
            backgroundColor: colors.redSofter,
            padding: space.md,
            gap: 0,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: space.sm,
              marginBottom: space.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.brandSoft,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand }} />
              <Text style={{ ...type.micro, color: colors.brand, letterSpacing: 0.5, fontWeight: '900' }}>
                LEG 2: RETURN JOURNEY
              </Text>
            </View>
            <Text
              style={{
                ...type.micro,
                color: colors.brand,
                backgroundColor: colors.brandSoft,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radius.pill,
              }}
            >
              From {destName.split(',')[0]}
            </Text>
          </View>

          {/* Return Origin (locked) */}
          <TimelineRow dotColor={colors.borderStrong} dotBorder={colors.surfaceAlt} isLast={false} lineColor={colors.brandSoft}>
            <RowLabel>Return Origin (Auto)</RowLabel>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: space.md,
                paddingVertical: 11,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <Text style={{ ...type.body, color: colors.textMuted, flex: 1 }} numberOfLines={1}>
                {destName}
              </Text>
              <Text
                style={{
                  ...type.micro,
                  color: colors.textFaint,
                  backgroundColor: colors.border,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}
              >
                AUTO
              </Text>
            </View>
          </TimelineRow>

          {/* Return Stops */}
          {returnStops.map((stop, i) => (
            <TimelineRow
              key={stop.id}
              dotColor={colors.brandSoft}
              dotBorder={colors.surface}
              isLast={false}
              lineColor={colors.brandSoft}
            >
              <RowLabel>Return Stop {i + 1}</RowLabel>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <ModalPicker
                    value={stop.locationId}
                    options={CITY_OPTS}
                    onChange={(id) => updateReturnStop(stop.id, id)}
                    placeholder={`Return stop ${i + 1}…`}
                    title={`Return Stop ${i + 1}`}
                    searchable
                    placeSearch
                  />
                </View>
                <StopRemoveButton onPress={() => removeReturnStop(stop.id)} />
              </View>
            </TimelineRow>
          ))}

          {/* Add Return Stop */}
          <View style={{ paddingLeft: 32, marginBottom: space.sm }}>
            <Pressable
              onPress={addReturnStop}
              disabled={!canAddReturnStop}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <Plus size={13} color={canAddReturnStop ? colors.brand : colors.textFaint} />
              <Text
                style={{
                  ...type.caption,
                  color: canAddReturnStop ? colors.brand : colors.textFaint,
                  fontWeight: '800',
                }}
              >
                Add Return Stop {returnStops.length > 0 ? `(${returnStops.length}/3)` : ''}
              </Text>
            </Pressable>
            {!canAddReturnStop && returnStops.length > 0 && returnStops.length < 3 ? (
              <Text style={{ ...type.micro, color: colors.textMuted, marginTop: 3 }}>
                Select a location above first
              </Text>
            ) : null}
          </View>

          {/* Final Return Destination */}
          <TimelineRow
            dotColor={colors.brand}
            dotBorder={colors.brandSoft}
            isLast
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <RowLabel>Final Return Destination (To)</RowLabel>
              {returnDropId === pickupId ? (
                <Text style={{ ...type.micro, color: colors.brand }}>Matches Pickup</Text>
              ) : null}
            </View>
            <ModalPicker
              value={returnDropId}
              options={CITY_OPTS.map((l) => ({
                ...l,
                label: l.id === pickupId ? `${l.label} (Initial Pickup)` : l.label,
              }))}
              onChange={handleReturnDropChange}
              placeholder="Select return destination"
              title="Final Return Destination"
              searchable
              placeSearch
            />
          </TimelineRow>

          {/* Return Telemetry */}
          <TelemetryFooter
            telemetry={returnTelemetry}
            style={{ borderColor: colors.brandSoft, backgroundColor: colors.redSofter }}
          />
        </View>
      )}

      {/* ── Round Trip Summary Banner ── */}
      {isTwoWay && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.graphite,
            borderRadius: radius.lg,
            paddingHorizontal: space.lg,
            paddingVertical: 12,
            gap: space.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: radius.sm,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Compass size={14} color={colors.onGraphite} />
            </View>
            <View>
              <Text style={{ ...type.micro, color: colors.textFaint, letterSpacing: 0.5 }}>
                TOTAL ROUND TRIP
              </Text>
              <Text style={{ ...type.caption, color: '#fff' }}>
                Outbound + Return
                {stops.length + returnStops.length > 0
                  ? ` (${stops.length + returnStops.length} stops)`
                  : ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: radius.sm,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ ...type.caption, color: colors.onGraphite, fontWeight: '900' }}>
                ~{totalKm} km
              </Text>
            </View>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: radius.sm,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ ...type.caption, color: '#fff', fontWeight: '900' }}>
                ~{formatDuration(totalMinutes)}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
