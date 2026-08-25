import { Text, View } from 'react-native'
import { colors, radius } from '../theme/tokens'

/**
 * Marks UI that is NOT backed by the Phase 1 API. See DEMO_FEATURES in
 * lib/config.js for what each one is waiting on.
 */
export default function DemoBadge({ style }) {
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: '#FEF3C7',
          borderRadius: radius.sm,
          paddingHorizontal: 6,
          paddingVertical: 2,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 9, fontWeight: '800', color: '#B45309', letterSpacing: 0.5 }}>
        DEMO
      </Text>
    </View>
  )
}
