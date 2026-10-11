import { useEffect, useMemo, useRef, useState } from 'react'
import Constants from 'expo-constants'
import { Platform, Pressable, Text, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { Car, LocateFixed, MapPin } from 'lucide-react-native'
import { colors, radius, space, type } from '../theme/tokens'

/**
 * On Android the map is Google Maps, and a build with no Maps API key crashes
 * as soon as a MapView mounts. Expo Go ships its own key; a development or
 * store build needs GOOGLE_MAPS_API_KEY_ANDROID (see app.config.js). Without
 * one this shows the addresses instead of a map.
 */
export const MAP_AVAILABLE =
  Platform.OS !== 'android' ||
  Constants.executionEnvironment === 'storeClient' ||
  Constants.expoConfig?.extra?.mapsEnabled === true

const REFRAME_EVERY_MS = 10_000
const EDGE_PADDING = { top: 56, right: 48, bottom: 56, left: 48 }

const isPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
const toCoordinate = (p) => ({ latitude: p.lat, longitude: p.lng })

function Pin({ tone }) {
  const fill = tone === 'drop' ? colors.red : colors.graphite
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fill,
        borderWidth: 2,
        borderColor: colors.onRed,
      }}
    >
      <MapPin size={13} color={colors.onRed} />
    </View>
  )
}

function DriverDot() {
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: colors.red,
      }}
    >
      <Car size={16} color={colors.red} />
    </View>
  )
}

/**
 * The trip on a real map: pickup, drop (when the booking has one) and the
 * driver's position from the live DRIVER_LOCATION frames. Nothing is drawn
 * for a point the server has not sent.
 */
export default function TripMap({ pickup, drop, driver, pickupLabel, dropLabel, style }) {
  const mapRef = useRef(null)
  const lastFrame = useRef(0)
  const [following, setFollowing] = useState(true)

  const hasPickup = isPoint(pickup)
  const hasDrop = isPoint(drop)
  const hasDriver = isPoint(driver)

  const points = useMemo(
    () => [hasPickup && pickup, hasDrop && drop, hasDriver && driver].filter(Boolean).map(toCoordinate),
    // Coordinates are compared by value: the driver frame is a new object every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPickup, hasDrop, hasDriver, pickup?.lat, pickup?.lng, drop?.lat, drop?.lng, driver?.lat, driver?.lng],
  )

  const frame = (animated = true) => {
    if (!mapRef.current || points.length === 0) return
    lastFrame.current = Date.now()
    if (points.length === 1) {
      mapRef.current.animateToRegion({ ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, animated ? 400 : 0)
    } else {
      mapRef.current.fitToCoordinates(points, { edgePadding: EDGE_PADDING, animated })
    }
  }

  // Keep everything in view as the driver moves, but not on every frame, and
  // not once the customer has moved the map themselves.
  const pointCount = points.length
  useEffect(() => {
    if (!following) return
    const due = Date.now() - lastFrame.current >= REFRAME_EVERY_MS
    if (due) frame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, following])

  // A new point (the driver's first position, usually) reframes at once.
  useEffect(() => {
    if (following) frame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointCount])

  if (!MAP_AVAILABLE || points.length === 0) {
    return (
      <View
        style={[
          { backgroundColor: colors.surfaceAlt, justifyContent: 'center', padding: space.lg, gap: space.sm },
          style,
        ]}
      >
        {pickupLabel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Pin tone="pickup" />
            <Text numberOfLines={2} style={{ ...type.caption, color: colors.text, flex: 1 }}>
              {pickupLabel}
            </Text>
          </View>
        ) : null}
        {dropLabel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Pin tone="drop" />
            <Text numberOfLines={2} style={{ ...type.caption, color: colors.text, flex: 1 }}>
              {dropLabel}
            </Text>
          </View>
        ) : null}
        <Text style={{ ...type.tiny, color: colors.textMuted }}>
          {MAP_AVAILABLE ? 'Waiting for the trip location' : 'The map is not available in this build'}
        </Text>
      </View>
    )
  }

  return (
    <View style={style}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onMapReady={() => frame(false)}
        onPanDrag={() => setFollowing(false)}
        initialRegion={{ ...points[0], latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        accessibilityLabel="Trip map"
      >
        {hasPickup ? (
          <Marker coordinate={toCoordinate(pickup)} title="Pickup" description={pickupLabel} tracksViewChanges={false}>
            <Pin tone="pickup" />
          </Marker>
        ) : null}
        {hasDrop ? (
          <Marker coordinate={toCoordinate(drop)} title="Drop" description={dropLabel} tracksViewChanges={false}>
            <Pin tone="drop" />
          </Marker>
        ) : null}
        {hasDriver ? (
          <Marker
            coordinate={toCoordinate(driver)}
            anchor={{ x: 0.5, y: 0.5 }}
            title="Your driver"
            tracksViewChanges={false}
          >
            <DriverDot />
          </Marker>
        ) : null}
      </MapView>

      {!following ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Re-centre the map on the trip"
          hitSlop={8}
          onPress={() => {
            setFollowing(true)
            frame()
          }}
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <LocateFixed size={18} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  )
}
