import { View } from 'react-native'
import { colors, radius, shadow, space } from '../theme/tokens'

export default function Card({ style, tone = 'surface', children, ...rest }) {
  const toneStyle =
    tone === 'alert'
      ? { backgroundColor: colors.redSoft, borderColor: colors.red }
      : tone === 'sunken'
        ? { backgroundColor: colors.surfaceAlt, borderColor: colors.border }
        : { backgroundColor: colors.surface, borderColor: colors.border }

  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: space.lg,
        },
        toneStyle,
        tone === 'surface' && shadow.card,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  )
}
