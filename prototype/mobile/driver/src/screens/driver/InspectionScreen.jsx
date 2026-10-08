import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { Camera, Check, ShieldCheck } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/apiClient'
import { colors, radius, space, type } from '../../theme/tokens'

/** Mirrors INSPECTION_ZONES in backend/src/modules/vault/zones.ts. */
const ZONES = [
  ['FRONT', 'Front'],
  ['REAR', 'Rear'],
  ['LEFT', 'Left side'],
  ['RIGHT', 'Right side'],
  ['DASHBOARD', 'Dashboard'],
  ['SEATS', 'Seats'],
  ['FUEL_ODOMETER', 'Fuel / odometer'],
  ['BOOT', 'Boot'],
]

async function fix() {
  try {
    const { coords } = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({})
    return { lat: coords.latitude, lng: coords.longitude }
  } catch {
    return undefined
  }
}

/**
 * Pre-trip Trip Vault inspection. Each photo goes to the server, which burns
 * the trip, zone, time and position into it and seals its SHA-256. The trip
 * cannot start until all eight are on record.
 */
export default function InspectionScreen({ tripId, onInspectionDone }) {
  const { toast } = useToast()
  const [remaining, setRemaining] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [sealing, setSealing] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.driver
      .startInspection(tripId, 'PRE')
      .then((r) => !cancelled && setRemaining(r.remaining))
      .catch((err) => toast(err?.message ?? 'Could not open the inspection', 'warning'))
    return () => {
      cancelled = true
    }
  }, [tripId, toast])

  const capture = async (zone, label) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      toast('Allow camera access to record the inspection', 'warning')
      return
    }
    const shot = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, mediaTypes: ['images'] })
    if (shot.canceled || !shot.assets?.[0]?.base64) return

    setUploading(zone)
    try {
      const res = await api.driver.capturePhoto(tripId, 'PRE', zone, shot.assets[0].base64, await fix())
      setRemaining(res.remaining)
    } catch (err) {
      toast(err?.message ?? `${label} did not upload. Try again.`, 'warning')
    } finally {
      setUploading(null)
    }
  }

  const seal = async () => {
    setSealing(true)
    try {
      await api.driver.completeInspection(tripId, 'PRE')
      toast('Inspection sealed in the Trip Vault', 'success')
      onInspectionDone()
    } catch (err) {
      // Already sealed (e.g. after an app restart) is fine: carry on.
      if (err?.code === 'INSPECTION_SEALED') onInspectionDone()
      else toast(err?.message ?? 'Could not seal the inspection', 'warning')
    } finally {
      setSealing(false)
    }
  }

  if (!remaining) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.red} />
      </View>
    )
  }

  const done = ZONES.length - remaining.length
  const allDone = remaining.length === 0

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.title, color: colors.text }}>Vehicle inspection</Text>
          <Text style={{ ...type.tiny, color: colors.textMuted }}>
            Photograph all 8 points before you drive · each photo is watermarked and sealed
          </Text>
        </View>
        <Pill label={`${done}/8`} tone={allDone ? 'solid' : 'neutral'} />
      </View>

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xs }}>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 8, now: done }}
          style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}
        >
          <View style={{ height: '100%', width: `${(done / ZONES.length) * 100}%`, borderRadius: radius.pill, backgroundColor: colors.red }} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: space.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ZONES.map(([zone, label]) => {
            const captured = !remaining.includes(zone)
            const busy = uploading === zone
            return (
              <Pressable
                key={zone}
                accessibilityRole="button"
                accessibilityLabel={captured ? `${label} captured` : `Photograph ${label}`}
                disabled={captured || Boolean(uploading)}
                onPress={() => capture(zone, label)}
                style={{
                  width: '47.5%',
                  height: 108,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: captured ? colors.red : colors.border,
                  backgroundColor: captured ? colors.redSoft : colors.surface,
                  padding: space.sm,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: captured ? colors.surface : colors.surfaceAlt,
                  }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.red} />
                  ) : captured ? (
                    <Check size={20} color={colors.red} />
                  ) : (
                    <Camera size={16} color={colors.textMuted} />
                  )}
                </View>
                <Text style={{ ...type.tiny, color: colors.text }}>{label}</Text>
                <Text style={{ fontSize: 10, color: colors.textMuted }}>
                  {captured ? 'Sealed' : busy ? 'Uploading…' : 'Tap to photograph'}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, padding: space.lg }}>
        <Button
          label={sealing ? 'Sealing…' : allDone ? 'Start trip' : `${remaining.length} photo${remaining.length === 1 ? '' : 's'} left`}
          icon={ShieldCheck}
          disabled={!allDone || sealing}
          onPress={seal}
        />
      </View>
    </SafeAreaView>
  )
}
