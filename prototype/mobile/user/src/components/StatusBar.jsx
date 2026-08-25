import { View, Text } from 'react-native'
import { BatteryFull, Signal, Wifi } from 'lucide-react-native'
import { colors, space, type } from '../theme/tokens'

/** Cosmetic in-app status bar, mirroring the web prototype's phone chrome. */
export default function FakeStatusBar() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.xl,
        paddingBottom: space.xs,
      }}
    >
      <Text style={{ ...type.tiny, color: colors.textMuted }}>9:41</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Signal size={14} color={colors.textMuted} />
        <Wifi size={14} color={colors.textMuted} />
        <BatteryFull size={16} color={colors.textMuted} />
      </View>
    </View>
  )
}
