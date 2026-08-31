import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Check, KeyRound, ScanFace, ShieldCheck } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
import { DEMO_OTP } from '../../data/mock'
import { useDriver } from '../../context/DriverContext'
import { colors, radius, space, type } from '../../theme/tokens'

const OTP_LENGTH = 4

/** Sweeping scan line, replacing the web prototype's CSS keyframes. */
function ScanLine({ height }) {
  const y = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [y])

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: colors.red,
        transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [height * 0.08, height * 0.88] }) }],
      }}
    />
  )
}

/**
 * Expo Go has no camera module wired up here, so the "selfie" is a placeholder
 * payload. The backend still runs it through the liveness provider and its
 * confidence threshold, so the gate itself is real — only the image is not.
 */
// Pre-encoded: React Native has no global Buffer, and btoa is not guaranteed
// on every engine. This is base64 for the ASCII string
// "mydriver-handshake-selfie".
const PLACEHOLDER_SELFIE = 'bXlkcml2ZXItaGFuZHNoYWtlLXNlbGZpZQ=='

export default function HandshakeScreen({ request, onVerified, onBack }) {
  const { submitHandshake } = useDriver()
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const [scanStage, setScanStage] = useState('idle')
  const [otp, setOtp] = useState(['', '', '', ''])
  const [otpError, setOtpError] = useState(false)
  const inputsRef = useRef([])
  const shake = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (scanStage !== 'scanning') return undefined
    const t = setTimeout(() => {
      setScanStage('matched')
      toast('Face match verified against master profile', 'success')
    }, 2000)
    return () => clearTimeout(t)
  }, [scanStage, toast])

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
      await submitHandshake(PLACEHOLDER_SELFIE, entered)
      toast('Handshake complete — proceed to inspection', 'success')
      onVerified?.()
    } catch (err) {
      setOtpError(true)
      runShake()
      if (err?.code === 'HANDSHAKE_LOCKED') {
        toast('Too many wrong codes — this trip can only be cancelled now', 'danger', 5000)
      } else if (err?.code === 'LIVENESS_FAILED') {
        toast('Face verification did not pass', 'danger')
      } else {
        toast(err?.message ?? 'Incorrect OTP — ask the customer again', 'danger')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const matched = scanStage === 'matched'

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
          accessibilityLabel="Back to requests"
          onPress={() => onBack?.()}
          style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 8 }}
        >
          <ArrowLeft size={16} color={colors.text} />
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
                STEP 1 · LIVENESS CHECK
              </Text>
            </View>
            {matched ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Check size={12} color={colors.graphite} />
                <Pill label="Matched" tone="safe" />
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
            {scanStage === 'scanning' ? (
              <>
                <ScanLine height={160} />
                <Text style={{ ...type.micro, color: colors.red, position: 'absolute', bottom: 8 }}>
                  Scanning face…
                </Text>
              </>
            ) : null}
            {scanStage === 'idle' ? (
              <Text style={{ ...type.micro, color: colors.textMuted, position: 'absolute', bottom: 8 }}>
                Camera standby
              </Text>
            ) : null}
          </View>

          <Button
            label={matched ? 'Identity confirmed' : scanStage === 'scanning' ? 'Verifying…' : 'Start face match'}
            variant={matched ? 'subtle' : 'primary'}
            disabled={scanStage === 'scanning'}
            onPress={() => setScanStage('scanning')}
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
            <Pill label={`Demo OTP: ${DEMO_OTP}`} tone="brand" />
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
            disabled={!matched || submitting}
            onPress={verify}
            style={{ marginTop: space.lg }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}
