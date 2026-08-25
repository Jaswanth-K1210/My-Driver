import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Camera, Check, MapPin, ShieldCheck } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import { useToast } from '../../components/Toast'
import { INSPECTION_POINTS } from '../../data/mock'
import { colors, radius, space, type } from '../../theme/tokens'

const CAPTURE_MS = 1400
const WATERMARK_GPS = '17.4435° N, 78.3772° E'

function CaptureOverlay({ point, flash }) {
  const scan = useRef(new Animated.Value(0)).current
  const flashOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [scan])

  useEffect(() => {
    if (!flash) return
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 0.9, duration: 130, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start()
  }, [flash, flashOpacity])

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 70,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 224,
          height: 224,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderRadius: radius.lg,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: colors.borderStrong,
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <Camera size={56} color={colors.borderStrong} />
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            backgroundColor: colors.red,
            transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [18, 200] }) }],
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: '#FFFFFF',
            opacity: flashOpacity,
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            borderRadius: 4,
            backgroundColor: 'rgba(12,12,16,0.8)',
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>{WATERMARK_GPS}</Text>
        </View>
      </View>
      <Text style={{ ...type.bodyBold, color: colors.text, marginTop: space.lg }}>Capturing: {point}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.xs }}>
        <MapPin size={12} color={colors.textMuted} />
        <Text style={{ ...type.tiny, color: colors.textMuted }}>Stamping GPS + timestamp</Text>
      </View>
    </View>
  )
}

export default function InspectionScreen({ onInspectionDone, onBack }) {
  const { toast } = useToast()
  const [captures, setCaptures] = useState({})
  const [capturing, setCapturing] = useState(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (capturing === null) return undefined
    const flashTimer = setTimeout(() => setFlash(true), CAPTURE_MS - 350)
    const doneTimer = setTimeout(() => {
      setCaptures((prev) => ({
        ...prev,
        [capturing]: new Date().toLocaleTimeString('en-IN', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      }))
      setCapturing(null)
      setFlash(false)
    }, CAPTURE_MS)
    return () => {
      clearTimeout(flashTimer)
      clearTimeout(doneTimer)
    }
  }, [capturing])

  const capturedCount = Object.keys(captures).length
  const allDone = capturedCount === INSPECTION_POINTS.length
  const remaining = INSPECTION_POINTS.length - capturedCount

  const startTrip = () => {
    if (!allDone) {
      toast('Capture all 8 points before starting', 'warning')
      return
    }
    toast('8-point inspection sealed to Trip Vault', 'success')
    onInspectionDone()
  }

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
          accessibilityLabel="Back to handshake"
          onPress={onBack}
          style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 8 }}
        >
          <ArrowLeft size={16} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.title, color: colors.text }}>8-point inspection</Text>
          <Text style={{ ...type.tiny, color: colors.textMuted }}>
            Watermarked photos · immutable timestamps
          </Text>
        </View>
        <Pill label={`${capturedCount}/8`} tone={allDone ? 'solid' : 'neutral'} />
      </View>

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xs }}>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 8, now: capturedCount }}
          style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}
        >
          <View
            style={{
              height: '100%',
              width: `${(capturedCount / INSPECTION_POINTS.length) * 100}%`,
              borderRadius: radius.pill,
              backgroundColor: colors.red,
            }}
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {INSPECTION_POINTS.map((point, index) => {
            const capturedAt = captures[index]
            const isCapturing = capturing === index
            return (
              <Pressable
                key={point}
                accessibilityRole="button"
                accessibilityLabel={capturedAt ? `${point} captured at ${capturedAt}` : `Capture ${point}`}
                disabled={isCapturing || Boolean(capturedAt)}
                onPress={() => setCapturing(index)}
                style={{
                  width: '47.5%',
                  height: 108,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: capturedAt ? colors.red : colors.border,
                  backgroundColor: capturedAt ? colors.redSoft : colors.surface,
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
                    backgroundColor: capturedAt ? colors.surface : colors.surfaceAlt,
                  }}
                >
                  {capturedAt ? (
                    <Check size={20} color={colors.red} />
                  ) : (
                    <Camera size={16} color={colors.textMuted} />
                  )}
                </View>
                <Text style={{ ...type.tiny, color: colors.text }}>{point}</Text>
                <Text style={{ fontSize: 9, color: colors.textMuted }}>
                  {capturedAt ?? (isCapturing ? 'Capturing…' : 'Tap to capture')}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
        }}
      >
        <Button
          label={allDone ? 'Start trip' : `Capture ${remaining} more point${remaining === 1 ? '' : 's'}`}
          icon={ShieldCheck}
          disabled={!allDone}
          onPress={startTrip}
        />
      </View>

      {capturing !== null ? (
        <CaptureOverlay point={INSPECTION_POINTS[capturing]} flash={flash} />
      ) : null}
    </SafeAreaView>
  )
}
