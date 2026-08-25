import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { X } from 'lucide-react-native'
import { colors, radius, space, type } from '../theme/tokens'

export default function BottomSheet({ open, onClose, title, children }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Close sheet"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,16,0.45)' }]}
        />
        <View
          style={{
            maxHeight: '78%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: space.xl,
            paddingTop: space.md,
            paddingBottom: space.xxl,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: radius.pill,
              backgroundColor: colors.borderStrong,
              marginBottom: space.lg,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: space.lg,
            }}
          >
            <Text style={{ ...type.title, color: colors.text }}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={{
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceAlt,
                padding: 7,
              }}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  )
}
