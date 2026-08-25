import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import Svg, { Circle, G, Path, Rect } from 'react-native-svg'
import { colors } from '../theme/tokens'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const ROUTE_POINTS = [
  { x: 28, y: 206 },
  { x: 96, y: 172 },
  { x: 128, y: 110 },
  { x: 210, y: 92 },
  { x: 268, y: 44 },
  { x: 312, y: 30 },
]

const SEGMENTS = ROUTE_POINTS.slice(0, -1).map((pt, i) => {
  const next = ROUTE_POINTS[i + 1]
  return { from: pt, to: next, len: Math.hypot(next.x - pt.x, next.y - pt.y) }
})

const TOTAL_LEN = SEGMENTS.reduce((sum, s) => sum + s.len, 0)

function pointAt(progress) {
  const target = (TOTAL_LEN * Math.min(Math.max(progress, 0), 100)) / 100
  let acc = 0
  for (const seg of SEGMENTS) {
    if (acc + seg.len >= target) {
      const t = (target - acc) / seg.len
      return {
        x: seg.from.x + (seg.to.x - seg.from.x) * t,
        y: seg.from.y + (seg.to.y - seg.from.y) * t,
      }
    }
    acc += seg.len
  }
  return ROUTE_POINTS[ROUTE_POINTS.length - 1]
}

const ROUTE_PATH = ROUTE_POINTS.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')

export default function MapCanvas({ progress = 0, style }) {
  const vehicle = pointAt(progress)
  // Replaces the web version's SVG <animate> element, which RN's SVG
  // renderer does not support.
  const pulse = useRef(new Animated.Value(12)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 18, duration: 1000, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 12, duration: 1000, useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <Svg
      viewBox="0 0 340 240"
      style={style}
      accessibilityRole="image"
      accessibilityLabel={`Trip map, ${Math.round(progress)} percent complete`}
    >
      <Rect width="340" height="240" rx="12" fill={colors.surfaceAlt} />
      {/* Major roads */}
      <G stroke="#E2E2E8" strokeWidth="7">
        <Path d="M0 52 H340 M0 118 H340 M0 184 H340 M64 0 V240 M148 0 V240 M232 0 V240 M304 0 V240" />
      </G>
      {/* Minor roads */}
      <G stroke="#ECECF1" strokeWidth="2">
        <Path d="M0 22 H340 M0 86 H340 M0 152 H340 M0 218 H340 M32 0 V240 M106 0 V240 M190 0 V240 M268 0 V240" />
      </G>
      <Path
        d={ROUTE_PATH}
        fill="none"
        stroke={colors.borderStrong}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="7 6"
      />
      {/* Pickup */}
      <Circle cx={ROUTE_POINTS[0].x} cy={ROUTE_POINTS[0].y} r="6" fill={colors.graphite} stroke={colors.bg} strokeWidth="2" />
      {/* Drop */}
      <Circle
        cx={ROUTE_POINTS[ROUTE_POINTS.length - 1].x}
        cy={ROUTE_POINTS[ROUTE_POINTS.length - 1].y}
        r="6"
        fill={colors.red}
        stroke={colors.bg}
        strokeWidth="2"
      />
      <G x={vehicle.x} y={vehicle.y}>
        <AnimatedCircle r={pulse} fill={colors.red} opacity={0.18} />
        <Circle r="7.5" fill={colors.red} stroke={colors.bg} strokeWidth="2.5" />
      </G>
    </Svg>
  )
}
