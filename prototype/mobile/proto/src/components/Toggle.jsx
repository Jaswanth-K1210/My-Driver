import { useEffect, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { colors, radius, space, type } from '../theme/tokens'

export default function Toggle({ checked, onChange, label }) {
  const knob = useRef(new Animated.Value(checked ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(knob, {
      toValue: checked ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start()
  }, [checked, knob])

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.md,
        paddingVertical: 6,
      }}
    >
      <Text style={{ ...type.body, color: colors.text, flex: 1 }}>{label}</Text>
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: radius.pill,
          backgroundColor: checked ? colors.red : colors.borderStrong,
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            width: 20,
            height: 20,
            borderRadius: radius.pill,
            backgroundColor: colors.onRed,
            marginLeft: 3,
            transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }],
          }}
        />
      </View>
    </Pressable>
  )
}
