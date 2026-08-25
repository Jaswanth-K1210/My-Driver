import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, font } from '../../theme/tokens';

export default function LoginScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('google');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = useCallback(() => {
    Alert.alert('Sign In', 'Google Sign In would open here', [
      { text: 'OK', onPress: () => navigation.replace('Main') },
    ]);
  }, [navigation]);

  const handleSendOtp = useCallback(() => {
    if (!phone || phone.length < 6) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setOtpSent(true);
      Alert.alert('OTP Sent', 'A verification code has been sent to your phone');
    }, 1000);
  }, [phone]);

  const handleVerifyOtp = useCallback(() => {
    const code = otp.join('');
    if (code.length !== 6) {
      Alert.alert('Error', 'Please enter the full 6-digit code');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigation.replace('Main');
    }, 800);
  }, [otp, navigation]);

  const handleOtpChange = useCallback((text, index) => {
    if (text.length > 1) text = text.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
  }, [otp]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logoMark}>
                <Text style={styles.logoIcon}>M</Text>
              </View>
            </View>
            <Text style={styles.appName}>MyDriver</Text>
            <Text style={styles.subtitle}>Welcome back</Text>
          </View>

          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'google' && styles.tabActive]}
              onPress={() => setActiveTab('google')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'google' && styles.tabTextActive]}>
                Google
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'phone' && styles.tabActive]}
              onPress={() => setActiveTab('phone')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'phone' && styles.tabTextActive]}>
                Phone OTP
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.methodSection}>
            {activeTab === 'google' ? (
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleLogin}
                activeOpacity={0.7}
              >
                <View style={styles.googleIcon}>
                  <Text style={styles.googleIconText}>G</Text>
                </View>
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              </TouchableOpacity>
            ) : (
              <View>
                {!otpSent ? (
                  <View>
                    <Text style={styles.inputLabel}>Phone Number</Text>
                    <View style={styles.phoneRow}>
                      <View style={styles.countryCode}>
                        <Text style={styles.countryCodeText}>+1</Text>
                      </View>
                      <TextInput
                        style={[styles.input, styles.phoneInput]}
                        placeholder="(555) 123-4567"
                        placeholderTextColor={colors.textFaint}
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        autoComplete="tel"
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={handleSendOtp}
                      activeOpacity={0.8}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color={colors.onRed} />
                      ) : (
                        <Text style={styles.primaryButtonText}>Send OTP</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.otpLabel}>
                      Enter the 6-digit code sent to +1 {phone}
                    </Text>
                    <View style={styles.otpRow}>
                      {otp.map((digit, index) => (
                        <TextInput
                          key={index}
                          style={styles.otpInput}
                          value={digit}
                          onChangeText={(text) => handleOtpChange(text, index)}
                          keyboardType="number-pad"
                          maxLength={1}
                          selectTextOnFocus
                        />
                      ))}
                    </View>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={handleVerifyOtp}
                      activeOpacity={0.8}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color={colors.onRed} />
                      ) : (
                        <Text style={styles.primaryButtonText}>Verify</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.resendButton}
                      onPress={() => {
                        setOtpSent(false);
                        setOtp(['', '', '', '', '', '']);
                      }}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.resendText}>Change phone number</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.footerLink}
            onPress={() => navigation.navigate('Signup')}
            activeOpacity={0.6}
          >
            <Text style={styles.footerText}>
              Don't have an account?{' '}
              <Text style={styles.footerBold}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  logoContainer: {
    marginBottom: spacing.lg,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: font.sizes.hero,
    fontWeight: font.weights.bold,
    color: colors.onRed,
  },
  appName: {
    fontSize: font.sizes.hero,
    fontWeight: font.weights.bold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: font.sizes.lg,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.xl,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.graphite,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: font.weights.semibold,
  },
  methodSection: {
    minHeight: 200,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  googleIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.bold,
    color: colors.textMuted,
  },
  googleButtonText: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.text,
  },
  inputLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  countryCode: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: font.sizes.md,
    color: colors.text,
  },
  phoneInput: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.red,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.onRed,
  },
  otpLabel: {
    fontSize: font.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  otpInput: {
    width: 48,
    height: 56,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: font.sizes.xl,
    fontWeight: font.weights.semibold,
    color: colors.text,
  },
  resendButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  resendText: {
    fontSize: font.sizes.sm,
    color: colors.red,
    fontWeight: font.weights.medium,
  },
  footerLink: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  footerText: {
    fontSize: font.sizes.sm,
    color: colors.textMuted,
  },
  footerBold: {
    color: colors.red,
    fontWeight: font.weights.semibold,
  },
});
