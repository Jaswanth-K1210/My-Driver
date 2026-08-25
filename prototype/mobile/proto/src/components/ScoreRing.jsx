import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { colors, type } from '../theme/tokens'

const SIZE = 96
const STROKE = 9
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R

export default function ScoreRing({ score, label = 'Safety score' }) {
  const pct = Math.min(Math.max(score, 0), 100) / 100

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.surfaceSunken}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.red}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRC * pct} ${CIRC}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ ...type.headline, color: colors.text }}>{score}</Text>
        <Text style={{ ...type.micro, color: colors.textMuted }}>{label}</Text>
      </View>
    </View>
  )
}
