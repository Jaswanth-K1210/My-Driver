import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, KeyRound, ScanFace, ShieldCheck, X } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
import TripMap from '../../components/TripMap'
import * as ImagePicker from 'expo-image-picker'
import { useDriver } from '../../context/DriverContext'
import { colors, radius, space, type } from '../../theme/tokens'

const OTP_LENGTH = 4

/**
 * The selfie is taken here and judged on the server: the liveness provider and
 * its confidence threshold decide, together with the customer's OTP, whether
 * the trip may start. Nothing on this screen claims a match by itself.
 *
 * The selfie and the typed code live in DriverFlow (`draft` / `onDraft`), not
 * here: returning from the camera re-checks the driver's approval, and while
 * that runs DriverFlow shows the loading screen in place of this one. State
 * kept on this screen was thrown away with it, so the selfie came back blank.
 */

/** The base64 photo in a camera result, or null (cancelled, error or no data). */
function photoFrom(result) {
  if (!result || 'code' in result || result.canceled) return null
  return result.assets?.[0]?.base64 ?? null
}

export default function HandshakeScreen({ request, onVerified, draft, onDraft }) {
  const { submitHandshake, cancelTrip } = useDriver()
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const { toast } = useToast()
  const { selfie, otp } = draft
  const setSelfie = (value) => onDraft(() => ({ selfie: value }))
  const setOtp = (next) => onDraft((prev) => ({ otp: typeof next === 'function' ? next(prev.otp) : next }))
  const [otpError, setOtpError] = useState(false)
  const inputsRef = useRef([])
  const shake = useRef(new Animated.Value(0)).current

  // Android may close the app while the camera is open (low memory). The photo
  // then comes back through getPendingResultAsync when the app starts again.
  useEffect(() => {
    let cancelled = false
    ImagePicker.getPendingResultAsync()
      .then((pending) => {
        const photo = photoFrom(Array.isArray(pending) ? pending[0] : pending)
        if (!cancelled && photo) setSelfie(photo)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const takeSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      toast('Allow camera access to take the pickup selfie', 'warning')
      return
    }
    let shot
    try {
      shot = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.5,
        exif: false,
        cameraType: ImagePicker.CameraType.front,
        mediaTypes: ['images'],
      })
    } catch (err) {
      toast(err?.message ?? 'Could not open the camera. Try again.', 'warning')
      return
    }
    if (shot.canceled) return
    const photo = photoFrom(shot)
    if (photo) setSelfie(photo)
    else toast('The photo could not be read. Take the selfie again.', 'warning')
  }

  const runShake = () => {
    shake.setValue(0)
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start()
  }

  const setDigit = (index, raw) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    setOtp((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    setOtpError(false)
    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handleKeyPress = (index, e) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  const verify = async () => {
    const entered = otp.join('')
    if (entered.length < OTP_LENGTH) {
      toast('Enter the full 4-digit OTP', 'warning')
      return
    }

    setSubmitting(true)
    try {
      // The server checks the code and the liveness confidence; it is the only
      // thing that can move the trip to IN_TRIP.
      await submitHandshake(selfie, entered)
      toast('Identity confirmed. Next, inspect the vehicle.', 'success')
      onVerified?.()
    } catch (err) {
      setOtpError(true)
      runShake()
      if (err?.code === 'HANDSHAKE_LOCKED') {
        toast('Too many wrong codes — this trip can only be cancelled now', 'danger', 5000)
      } else if (err?.code === 'LIVENESS_FAILED') {
        setSelfie(null)
        toast('Face check did not pass. Retake the selfie in good light.', 'danger')
      } else {
        toast(err?.message ?? 'Incorrect OTP — ask the customer again', 'danger')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const confirmCancel = () =>
    Alert.alert('Cancel this trip?', 'The customer will be told that you cancelled.', [
      { text: 'Keep trip', style: 'cancel' },
      {
        text: 'Cancel trip',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true)
          try {
            await cancelTrip('Cancelled by the driver before pickup')
            toast('Trip cancelled', 'info')
          } catch (err) {
            setCancelling(false)
            toast(err?.message ?? 'Could not cancel the trip', 'warning')
          }
        },
      },
    ])

  const matched = Boolean(selfie)

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel trip"
          disabled={cancelling || submitting}
          onPress={confirmCancel}
          style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 8 }}
        >
          <X size={16} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.title, color: colors.text }}>Pickup handshake</Text>
          <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
            {request.customer} · {request.pickup}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, gap: space.lg }}
      >
        <TripMap destination={request.pickupCoords} destinationLabel={request.pickup} title="Pickup" />
        <Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: space.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ScanFace size={13} color={colors.textMuted} />
              <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
                STEP 1 · PICKUP SELFIE
              </Text>
            </View>
            {matched ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Check size={12} color={colors.graphite} />
                <Pill label="Ready" tone="safe" />
              </View>
            ) : null}
          </View>

          <View
            style={{
              height: 160,
              maxWidth: 240,
              width: '100%',
              alignSelf: 'center',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <ScanFace size={64} color={matched ? colors.red : colors.borderStrong} />
            <Text style={{ ...type.micro, color: matched ? colors.red : colors.textMuted, position: 'absolute', bottom: 8 }}>
              {matched ? 'Selfie captured · checked on submit' : 'Front camera'}
            </Text>
          </View>

          <Button
            label={matched ? 'Retake selfie' : 'Take selfie'}
            variant={matched ? 'subtle' : 'primary'}
            onPress={takeSelfie}
            style={{ marginTop: space.md }}
          />
        </Card>

        <Card style={{ opacity: matched ? 1 : 0.5 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: space.xs,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <KeyRound size={13} color={colors.textMuted} />
              <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
                STEP 2 · CUSTOMER OTP
              </Text>
            </View>
          </View>

          <Text style={{ ...type.tiny, color: colors.textMuted, marginBottom: space.md, lineHeight: 16 }}>
            Engine start stays locked until the customer shares their trip OTP.
          </Text>

          <Animated.View
            accessibilityLabel="OTP entry"
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: space.md,
              transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }],
            }}
          >
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el
                }}
                value={digit}
                editable={matched}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={1}
                onChangeText={(v) => setDigit(i, v)}
                onKeyPress={(e) => handleKeyPress(i, e)}
                accessibilityLabel={`OTP digit ${i + 1}`}
                style={{
                  width: 48,
                  height: 56,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: otpError ? colors.redDeep : digit ? colors.red : colors.border,
                  backgroundColor: colors.surfaceAlt,
                  textAlign: 'center',
                  fontSize: 20,
                  fontWeight: '900',
                  color: colors.text,
                }}
              />
            ))}
          </Animated.View>

          <Button
            label={submitting ? 'Verifying…' : 'Verify & unlock engine'}
            icon={ShieldCheck}
            disabled={!matched || submitting || cancelling}
            onPress={verify}
            style={{ marginTop: space.lg }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}
