import { useEffect, useRef, useState } from 'react'
import Constants from 'expo-constants'
import * as Location from 'expo-location'
import { Linking, Platform, Text, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { MapPin, Navigation } from 'lucide-react-native'
import { colors, radius, space, type } from '../theme/tokens'
import Button from './Button'
import Card from './Card'
import { useToast } from './Toast'

/**
 * On Android the map is Google Maps, and a build with no Maps API key crashes
 * as soon as a MapView mounts. Expo Go ships its own key; a development or
 * store build needs GOOGLE_MAPS_API_KEY_ANDROID (see app.config.js). Without
 * one the card still shows the address and the Navigate button.
 */
const MAP_AVAILABLE =
  Platform.OS !== 'android' ||
  Constants.executionEnvironment === 'storeClient' ||
  Constants.expoConfig?.extra?.mapsEnabled === true

/** Turn-by-turn in Google Maps (the app if installed, else the browser). */
export function openNavigation({ lat, lng }) {
  return Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
  )
}

function Pin() {
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.red,
        borderWidth: 2,
        borderColor: colors.onRed,
      }}
    >
      <MapPin size={14} color={colors.onRed} />
    </View>
  )
}

/** The driver. Drawn here rather than by the platform, whose dot is blue. */
function Me() {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: radius.pill,
        backgroundColor: colors.graphite,
        borderWidth: 3,
        borderColor: colors.onGraphite,
      }}
    />
  )
}

/**
 * The driver's own position and one destination: the pickup before the
 * handshake, the drop during the drive.
 */
export default function TripMap({ destination, destinationLabel, title }) {
  const { toast } = useToast()
  const hasPoint = destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)
  const showMap = Boolean(hasPoint && MAP_AVAILABLE)
  const mapRef = useRef(null)
  const framed = useRef(false)
  const [me, setMe] = useState(null)

  // A coarse fix every few seconds is enough to draw a dot; the trip's own
  // tracking (lib/tracking.js) is separate and runs at full accuracy.
  useEffect(() => {
    if (!showMap) return undefined
    let sub
    let cancelled = false
    ;(async () => {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (status !== 'granted' || cancelled) return
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        ({ coords }) => setMe({ latitude: coords.latitude, longitude: coords.longitude }),
      )
      if (cancelled) sub.remove()
    })().catch(() => undefined)
    return () => {
      cancelled = true
      sub?.remove()
    }
  }, [showMap])

  // Once, when the first fix arrives: show both the driver and the destination.
  useEffect(() => {
    if (!me || framed.current || !mapRef.current) return
    framed.current = true
    mapRef.current.fitToCoordinates([me, { latitude: destination.lat, longitude: destination.lng }], {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    })
  }, [me, destination])

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {showMap && (
        <MapView
          ref={mapRef}
          style={{ height: 180 }}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          initialRegion={{
            latitude: destination.lat,
            longitude: destination.lng,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
        >
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            title={title}
            description={destinationLabel}
            tracksViewChanges={false}
          >
            <Pin />
          </Marker>
          {me && (
            <Marker coordinate={me} anchor={{ x: 0.5, y: 0.5 }} title="You" tracksViewChanges={false}>
              <Me />
            </Marker>
          )}
        </MapView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
            {String(title).toUpperCase()}
          </Text>
          <Text numberOfLines={2} style={{ ...type.caption, color: colors.text, marginTop: 2 }}>
            {destinationLabel}
          </Text>
        </View>
        {hasPoint && (
          <Button
            label="Navigate"
            icon={Navigation}
            variant="outline"
            accessibilityLabel={`Navigate to ${title} in Google Maps`}
            style={{ paddingVertical: 10 }}
            onPress={() =>
              openNavigation(destination).catch(() => toast('Could not open Google Maps', 'warning'))
            }
          />
        )}
      </View>
    </Card>
  )
}
