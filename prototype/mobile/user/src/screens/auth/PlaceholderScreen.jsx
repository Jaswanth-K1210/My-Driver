import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, radius, spacing, font } from '../../theme/tokens'

export default function PlaceholderScreen({ onLogout }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoMark}>
          <Text style={styles.logoIcon}>M</Text>
        </View>
        <Text style={styles.title}>Welcome!</Text>
        <Text style={styles.subtitle}>You are signed in to MyDriver.</Text>
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={onLogout}
        activeOpacity={0.7}
      >
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoMark: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoIcon: {
    fontSize: 40,
    fontWeight: font.weights.bold,
    color: colors.onRed,
  },
  title: {
    fontSize: font.sizes.hero,
    fontWeight: font.weights.bold,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.medium,
    color: colors.textMuted,
  },
  logoutBtn: {
    paddingVertical: spacing.lg,
    paddingHorizontal: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.red,
  },
  logoutText: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.semibold,
    color: colors.red,
  },
})
