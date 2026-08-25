import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '../../theme/tokens';

export default function PlaceholderScreen({ navigation }) {
  const handleLogout = () => {
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoMark}>
          <Text style={styles.logoIcon}>M</Text>
        </View>
        <Text style={styles.title}>Welcome, Driver!</Text>
        <Text style={styles.subtitle}>You are signed in to MyDriver.</Text>
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
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
    marginBottom: 24,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoIcon: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.onRed,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textMuted,
  },
  logoutBtn: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.red,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.red,
  },
});
