import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { ArrowLeft, Camera, Check, RotateCw, ShieldCheck } from 'lucide-react-native'
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

const COPY = {
  PRE: {
    title: 'Vehicle inspection',
    hint: 'Photograph all 8 points before you drive · each photo is watermarked and sealed',
    done: 'Start trip',
  },
  POST: {
    title: 'Drop-off inspection',
    hint: 'Photograph all 8 points before you end the trip · this is your record of the car as you left it',
    done: 'Seal and end trip',
  },
}

const UPLOAD_ATTEMPTS = 3
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Trip Vault inspection, before the drive (PRE) and at drop-off (POST). Each
 * photo goes to the server, which burns the trip, zone, time and position into
 * it and seals its SHA-256. The button stays locked until the server has all
 * eight; a photo that fails to upload is kept and retried, not retaken.
 */
export default function InspectionScreen({ tripId, phase = 'PRE', onInspectionDone, onBack }) {
  const { toast } = useToast()
  const copy = COPY[phase]
  const [remaining, setRemaining] = useState(null)
  const [uploading, setUploading] = useState({})
  // Photos taken but not yet accepted by the server: { [zone]: { base64, coords } }.
  const [failed, setFailed] = useState({})
  const [sealing, setSealing] = useState(false)
  const [openError, setOpenError] = useState(null)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const sync = useCallback(async () => {
    const r = await api.driver.startInspection(tripId, phase)
    if (mounted.current) setRemaining(r.remaining)
    return r.remaining
  }, [tripId, phase])

  const open = useCallback(() => {
    setOpenError(null)
    sync().catch((err) => mounted.current && setOpenError(err?.message ?? 'Could not open the inspection'))
  }, [sync])

  useEffect(open, [open])

  const upload = useCallback(
    async (zone, label, photo) => {
      setUploading((u) => ({ ...u, [zone]: true }))
      let lastError
      try {
        for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
          try {
            const res = await api.driver.capturePhoto(tripId, phase, zone, photo.base64, photo.coords)
            if (!mounted.current) return
            setRemaining(res.remaining)
            setFailed(({ [zone]: _sent, ...rest }) => rest)
            return
          } catch (err) {
            lastError = err
            // Only a dropped connection or a server fault is worth repeating.
            if (!(err?.code === 'NETWORK_ERROR' || err?.status >= 500)) break
            if (attempt < UPLOAD_ATTEMPTS) await wait(1500 * attempt)
          }
        }
        if (!mounted.current) return
        // The server may have stored it even though the reply was lost.
        const left = await sync().catch(() => null)
        if (left && !left.includes(zone)) {
          setFailed(({ [zone]: _sent, ...rest }) => rest)
          return
        }
        setFailed((f) => ({ ...f, [zone]: photo }))
        toast(
          lastError?.code === 'NETWORK_ERROR'
            ? `${label} is saved on this phone. Tap it to retry when you have signal.`
            : (lastError?.message ?? `${label} did not upload. Tap it to retry.`),
          'warning',
        )
      } finally {
        if (mounted.current) setUploading(({ [zone]: _done, ...rest }) => rest)
      }
    },
    [tripId, phase, sync, toast],
  )

  const capture = async (zone, label) => {
    if (failed[zone]) return upload(zone, label, failed[zone])

    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      toast('Allow camera access to record the inspection', 'warning')
      return
    }
    const shot = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, mediaTypes: ['images'] })
    if (shot.canceled || !shot.assets?.[0]?.base64) return
    return upload(zone, label, { base64: shot.assets[0].base64, coords: await fix() })
  }

  const retryAll = () => {
    for (const [zone, label] of ZONES) {
      if (failed[zone] && !uploading[zone]) void upload(zone, label, failed[zone])
    }
  }

  const seal = async () => {
    setSealing(true)
    try {
      await api.driver.completeInspection(tripId, phase)
      toast('Inspection sealed in the Trip Vault', 'success')
      await onInspectionDone()
    } catch (err) {
      // Already sealed (e.g. after an app restart) is fine: carry on.
      if (err?.code === 'INSPECTION_SEALED') await onInspectionDone()
      else toast(err?.message ?? 'Could not seal the inspection', 'warning')
    } finally {
      if (mounted.current) setSealing(false)
    }
  }

  if (!remaining) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.bg }}>
        {openError ? (
          <>
            <Text style={{ ...type.body, color: colors.text, textAlign: 'center' }}>{openError}</Text>
            <Button label="Try again" variant="outline" onPress={open} />
            {onBack ? <Button label="Back to the trip" variant="subtle" onPress={onBack} /> : null}
          </>
        ) : (
          <ActivityIndicator color={colors.red} />
        )}
      </View>
    )
  }

  const done = ZONES.length - remaining.length
  const allDone = remaining.length === 0
  const failedCount = Object.keys(failed).length
  const anyUploading = Object.keys(uploading).length > 0

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to the trip"
            disabled={sealing}
            onPress={onBack}
            style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 8 }}
          >
            <ArrowLeft size={16} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.title, color: colors.text }}>{copy.title}</Text>
          <Text style={{ ...type.tiny, color: colors.textMuted }}>{copy.hint}</Text>
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
            const busy = Boolean(uploading[zone])
            const retry = !captured && !busy && Boolean(failed[zone])
            return (
              <Pressable
                key={zone}
                accessibilityRole="button"
                accessibilityLabel={
                  captured ? `${label} captured` : retry ? `Retry uploading ${label}` : `Photograph ${label}`
                }
                disabled={captured || busy}
                onPress={() => capture(zone, label)}
                style={{
                  width: '47.5%',
                  height: 108,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: captured || retry ? colors.red : colors.border,
                  borderStyle: retry ? 'dashed' : 'solid',
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
                  ) : retry ? (
                    <RotateCw size={16} color={colors.red} />
                  ) : (
                    <Camera size={16} color={colors.textMuted} />
                  )}
                </View>
                <Text style={{ ...type.tiny, color: colors.text }}>{label}</Text>
                <Text style={{ fontSize: 10, color: colors.textMuted }}>
                  {captured ? 'Uploaded' : busy ? 'Uploading…' : retry ? 'Not uploaded · tap to retry' : 'Tap to photograph'}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, padding: space.lg }}>
        {failedCount > 0 && (
          <Button
            label={`Retry ${failedCount} failed upload${failedCount === 1 ? '' : 's'}`}
            icon={RotateCw}
            variant="outline"
            disabled={anyUploading}
            onPress={retryAll}
            style={{ marginBottom: space.sm }}
          />
        )}
        <Button
          label={sealing ? 'Sealing…' : allDone ? copy.done : `${remaining.length} photo${remaining.length === 1 ? '' : 's'} left`}
          icon={ShieldCheck}
          disabled={!allDone || sealing}
          onPress={seal}
        />
      </View>
    </SafeAreaView>
  )
}
