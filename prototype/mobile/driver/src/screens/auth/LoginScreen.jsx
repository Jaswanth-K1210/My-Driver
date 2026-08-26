import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { GOOGLE_ENABLED } from '../../lib/config';
import { toE164, isValidLocal } from '../../lib/phone';

export default function LoginScreen({ navigation }) {
  const { requestOtp, verifyOtp } = useAuth();
  // Phone OTP is the working path; Google needs an OAuth client ID.
  const [method, setMethod] = useState(GOOGLE_ENABLED ? 'google' : 'phone');
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const handleGoogleSignIn = useCallback(() => {
    Alert.alert(
      'Google sign-in not configured',
      "Set EXPO_PUBLIC_GOOGLE_CLIENT_ID (and add the same ID to the backend's GOOGLE_CLIENT_IDS) to enable this. Use your mobile number in the meantime.",
    );
  }, []);

  const handleSendOtp = useCallback(async () => {
    if (!isValidLocal(phone)) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      await requestOtp(toE164(phone));
      setOtpSent(true);
      Alert.alert('OTP Sent', 'A verification code has been sent to your phone.');
    } catch (err) {
      Alert.alert('Could not send code', err?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [phone, requestOtp]);

  const handleVerifyOtp = useCallback(async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(toE164(phone), otp);
      navigation.replace('Main');
    } catch (err) {
      Alert.alert('Verification failed', err?.message ?? 'That code is not valid.');
    } finally {
      setLoading(false);
    }
  }, [otp, phone, verifyOtp, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>M</Text>
          </View>
          <Text style={styles.title}>MyDriver</Text>
          <Text style={styles.subtitle}>Driver</Text>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, method === 'google' && styles.tabActive]}
            onPress={() => setMethod('google')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, method === 'google' && styles.tabTextActive]}>
              Google
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, method === 'phone' && styles.tabActive]}
            onPress={() => { setMethod('phone'); setOtpSent(false); setOtp(''); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, method === 'phone' && styles.tabTextActive]}>
              Phone OTP
            </Text>
          </TouchableOpacity>
        </View>

        {method === 'google' ? (
          <View style={styles.body}>
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleSignIn}
              activeOpacity={0.7}
            >
              <View style={styles.googleIconWrap}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Sign in with Google</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.body}>
            {!otpSent ? (
              <>
                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>+91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="555 123 4567"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    maxLength={14}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.primaryBtnText}>{loading ? 'Sending…' : 'Send OTP'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>Verification Code</Text>
                <Text style={styles.hint}>Enter the 6-digit code sent to {toE164(phone)}</Text>
                <TextInput
                  style={styles.otpInput}
                  placeholder="000000"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  textAlign="center"
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.primaryBtnText}>{loading ? 'Verifying…' : 'Verify'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => { setOtpSent(false); setOtp(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.linkText}>Change Number</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <TouchableOpacity
          style={styles.footerLink}
          onPress={() => navigation.navigate('Signup')}
          activeOpacity={0.7}
        >
          <Text style={styles.footerText}>
            Don't have an account?{' '}
            <Text style={styles.footerBold}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 44,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  logoIcon: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.onRed,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: 32,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textFaint,
  },
  tabTextActive: {
    color: colors.text,
  },
  body: {
    marginBottom: 32,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  googleIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
  },
  phoneRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  countryCode: {
    width: 56,
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRightWidth: 0,
    borderRadius: radius.sm,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  phoneInput: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  otpInput: {
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: 20,
    letterSpacing: 8,
  },
  primaryBtn: {
    backgroundColor: colors.red,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 2 },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onRed,
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  footerLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  footerText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  footerBold: {
    fontWeight: '700',
    color: colors.red,
  },
});
