import { useEffect, useRef } from 'react'
import { Animated, Easing, Text, TouchableOpacity, View } from 'react-native'
import { Clock, Search, X } from 'lucide-react-native'
import { colors, radius, space, type } from '../../theme/tokens'

const CHECKS = ['Police background check', 'Face-match handshake armed', 'Speed ceiling applied']

export default function MatchingScreen({ status, onCancel }) {
  const ring = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 1800,
        easing: Easing.bezier(0.2, 0.6, 0.4, 1),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [ring])

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xxl,
        padding: space.xl,
      }}
    >
      <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 80,
            height: 80,
            borderRadius: radius.pill,
            borderWidth: 2,
            borderColor: colors.red,
            opacity: ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.7, 0, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.7] }) }],
          }}
        />
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: radius.pill,
            backgroundColor: colors.redSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Search size={32} color={colors.red} />
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: space.xs }}>
        <Text style={{ ...type.title, color: colors.text }}>
          {status ?? 'Matching a certified driver…'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Clock size={13} color={colors.textMuted} />
          <Text style={{ ...type.tiny, color: colors.textMuted }}>
            Drivers have 20 seconds to accept
          </Text>
        </View>
      </View>

      <View style={{ width: '100%', maxWidth: 260, gap: space.sm }}>
        {CHECKS.map((item) => (
          <View
            key={item}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceAlt,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.red }} />
            <Text style={{ ...type.tiny, color: colors.text }}>{item}</Text>
          </View>
        ))}
      </View>

      {onCancel && (
        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm }}
        >
          <X size={14} color={colors.textMuted} />
          <Text style={{ ...type.tiny, color: colors.textMuted }}>Cancel request</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
