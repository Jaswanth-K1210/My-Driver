import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { Check, Clock, CreditCard, Fingerprint, IdCard, LogOut, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useDriver } from '../../context/DriverContext'
import { api } from '../../lib/apiClient'
import { hasOnboardingChanged } from '../../lib/onboardingGate'
import { unregisterPush } from '../../lib/push'
import { colors, radius, space, type } from '../../theme/tokens'

const input = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 12,
  fontSize: 15,
  color: colors.text,
  backgroundColor: colors.surface,
}

// While under review, check quietly for the console's decision so approval
// comes through even without push.
const REVIEW_POLL_MS = 10_000

const STATUS_COPY = {
  PENDING: { title: 'Finish your verification', body: 'Complete the three steps below. It takes about five minutes.' },
  UNDER_REVIEW: { title: 'We are reviewing your profile', body: 'Our team checks your licence within one working day. We will notify you when you are approved.' },
  TESTING: { title: 'Assessments in progress', body: 'Complete your driving assessments to move to review.' },
  REJECTED: { title: 'Your application needs attention', body: 'See the note from our team below, fix what is asked, and resubmit.' },
  SUSPENDED: { title: 'Your account is suspended', body: 'Contact partner support to understand next steps.' },
}

function Step({ index, icon: Icon, title, done, pending, children }) {
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: done ? colors.graphite : colors.redSoft,
          }}
        >
          {done ? <Check size={18} color={colors.onGraphite} /> : <Icon size={18} color={colors.red} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>STEP {index}</Text>
          <Text style={{ ...type.title, color: colors.text }}>{title}</Text>
        </View>
        {done ? <Pill label="VERIFIED" tone="safe" /> : pending ? <Pill label="IN REVIEW" tone="neutral" /> : null}
      </View>
      {children}
    </Card>
  )
}

function PanStep({ check, onDone }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [pan, setPan] = useState('')
  const [name, setName] = useState(user?.full_name ?? '')
  const [busy, setBusy] = useState(false)
  const done = check?.status === 'VERIFIED'
  const valid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) && name.trim().length >= 2

  const submit = async () => {
    setBusy(true)
    try {
      await api.kyc.verifyPan(pan, name.trim())
      toast('PAN verified', 'success')
      onDone()
    } catch (err) {
      toast(err?.message ?? 'PAN could not be verified', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Step index={1} icon={CreditCard} title="PAN card" done={done}>
      {done ? (
        <Text style={{ ...type.caption, color: colors.textMuted }}>
          PAN ending {check.last4}{check.name ? ` · ${check.name}` : ''}
        </Text>
      ) : (
        <>
          <TextInput
            style={input}
            placeholder="Name as on PAN"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />
          <TextInput
            style={[input, { letterSpacing: 2, fontWeight: '700' }]}
            placeholder="ABCPE1234F"
            placeholderTextColor={colors.textFaint}
            value={pan}
            onChangeText={(v) => setPan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Button label={busy ? 'Verifying…' : 'Verify PAN'} onPress={submit} disabled={!valid || busy} />
        </>
      )}
    </Step>
  )
}

function AadhaarStep({ check, onDone }) {
  const { toast } = useToast()
  const [aadhaar, setAadhaar] = useState('')
  const [refId, setRefId] = useState(null)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const done = check?.status === 'VERIFIED'
  const digits = aadhaar.replace(/\D/g, '')

  const sendOtp = async () => {
    setBusy(true)
    try {
      const { ref_id } = await api.kyc.requestAadhaarOtp(digits)
      setRefId(ref_id)
      toast('OTP sent to your Aadhaar-linked mobile', 'info')
    } catch (err) {
      toast(err?.message ?? 'Could not send the OTP', 'warning')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    try {
      await api.kyc.verifyAadhaarOtp(refId, otp)
      toast('Aadhaar verified', 'success')
      onDone()
    } catch (err) {
      toast(err?.message ?? 'Aadhaar could not be verified', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Step index={2} icon={Fingerprint} title="Aadhaar" done={done}>
      {done ? (
        <Text style={{ ...type.caption, color: colors.textMuted }}>Aadhaar ending {check.last4}</Text>
      ) : !refId ? (
        <>
          <TextInput
            style={[input, { letterSpacing: 2, fontWeight: '700' }]}
            placeholder="1234 5678 9012"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            value={aadhaar}
            onChangeText={(v) => setAadhaar(v.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 '))}
          />
          <Button label={busy ? 'Sending…' : 'Send OTP'} onPress={sendOtp} disabled={digits.length !== 12 || busy} />
        </>
      ) : (
        <>
          <Text style={{ ...type.caption, color: colors.textMuted }}>
            Enter the 6-digit code sent to the mobile number linked to Aadhaar ending {digits.slice(-4)}.
          </Text>
          <TextInput
            style={[input, { letterSpacing: 8, fontWeight: '800', textAlign: 'center' }]}
            placeholder="000000"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
          />
          <Button label={busy ? 'Verifying…' : 'Verify Aadhaar'} onPress={verify} disabled={otp.length !== 6 || busy} />
          <Button label="Use a different number" variant="ghost" onPress={() => { setRefId(null); setOtp('') }} />
        </>
      )}
    </Step>
  )
}

function LicenceStep({ doc, onDone }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [last4, setLast4] = useState('')
  const done = doc?.status === 'VERIFIED'
  const inReview = doc?.status === 'SUBMITTED'

  const pick = async (fromCamera) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      toast(fromCamera ? 'Allow camera access to photograph your licence' : 'Allow photo access to upload your licence', 'warning')
      return
    }
    const opts = { base64: true, quality: 0.7, mediaTypes: ['images'] }
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
    if (res.canceled || !res.assets?.[0]?.base64) return

    setBusy(true)
    try {
      await api.driver.uploadDocument('DRIVING_LICENCE', res.assets[0].base64, last4.length === 4 ? { number_last4: last4 } : {})
      toast('Licence uploaded for review', 'success')
      onDone()
    } catch (err) {
      toast(err?.message ?? 'Upload failed', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Step index={3} icon={IdCard} title="Driving licence" done={done} pending={inReview}>
      {done ? (
        <Text style={{ ...type.caption, color: colors.textMuted }}>Licence verified by our team</Text>
      ) : inReview ? (
        <Text style={{ ...type.caption, color: colors.textMuted }}>Uploaded. Our team reviews licences within one working day.</Text>
      ) : (
        <>
          {doc?.status === 'REJECTED' && (
            <Text style={{ ...type.caption, color: colors.redPressed }}>
              Previous upload rejected: {doc.reject_reason ?? 'please upload a clearer photo'}
            </Text>
          )}
          <Text style={{ ...type.caption, color: colors.textMuted }}>
            Photograph the front of your licence in good light, with all four corners visible.
          </Text>
          <TextInput
            style={input}
            placeholder="Last 4 characters of licence number (optional)"
            placeholderTextColor={colors.textFaint}
            value={last4}
            onChangeText={(v) => setLast4(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            autoCapitalize="characters"
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button style={{ flex: 1 }} label={busy ? 'Uploading…' : 'Take photo'} onPress={() => pick(true)} disabled={busy} />
            <Button style={{ flex: 1 }} label="Upload" variant="subtle" onPress={() => pick(false)} disabled={busy} />
          </View>
        </>
      )}
    </Step>
  )
}

/** Shown in place of the driver home until ops approves the driver. */
export default function OnboardingScreen({ onboarding, reload, onLogout }) {
  const { signOut } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const copy = STATUS_COPY[onboarding.onboarding_status] ?? STATUS_COPY.PENDING
  const licence = onboarding.documents?.find((d) => d.kind === 'DRIVING_LICENCE')

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await reload()
    setRefreshing(false)
  }, [reload])

  // A full reload() swaps this screen for a loading state, so the poll only
  // reads the payload and reloads when something changed. Errors are ignored:
  // the driver is not approved either way, and pull-to-refresh still works.
  const onboardingRef = useRef(onboarding)
  onboardingRef.current = onboarding
  const underReview = onboarding.onboarding_status === 'UNDER_REVIEW'
  useEffect(() => {
    if (!underReview) return undefined
    let checking = false
    const id = setInterval(async () => {
      if (checking || AppState.currentState !== 'active') return
      checking = true
      try {
        const raw = await api.driver.onboarding()
        if (hasOnboardingChanged(onboardingRef.current, raw)) await reload()
      } catch {
        // Next tick tries again.
      } finally {
        checking = false
      }
    }, REVIEW_POLL_MS)
    return () => clearInterval(id)
  }, [underReview, reload])

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingVertical: space.md }}>
        <Text style={{ ...type.title, color: colors.text }}>Partner verification</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={async () => {
            await unregisterPush()
            await signOut()
            onLogout?.()
          }}
          style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 10 }}
        >
          <LogOut size={16} color={colors.text} />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.red} />}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.lg }}
        >
          <Card tone="sunken" style={{ flexDirection: 'row', gap: space.md }}>
            {onboarding.onboarding_status === 'UNDER_REVIEW' ? (
              <Clock size={20} color={colors.text} />
            ) : (
              <ShieldCheck size={20} color={colors.red} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ ...type.bodyBold, color: colors.text }}>{copy.title}</Text>
              <Text style={{ ...type.caption, color: colors.textMuted, marginTop: 4, lineHeight: 18 }}>{copy.body}</Text>
              {onboarding.review_note ? (
                <Text style={{ ...type.caption, color: colors.redPressed, marginTop: space.sm }}>Note: {onboarding.review_note}</Text>
              ) : null}
            </View>
          </Card>

          <PanStep check={onboarding.kyc?.pan} onDone={reload} />
          <AadhaarStep check={onboarding.kyc?.aadhaar} onDone={reload} />
          <LicenceStep doc={licence} onDone={reload} />

          <Text style={{ ...type.tiny, color: colors.textMuted, textAlign: 'center', lineHeight: 16 }}>
            Checks run through a licensed verification partner. MyDriver stores only the last four
            characters of your PAN and Aadhaar.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function OnboardingLoading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.red} />
    </View>
  )
}

/**
 * Shown when onboarding validation fails due to a network error, requires
 * post-trip revalidation, or receives a server 403 denial without a qualifying
 * active trip. Never assumes APPROVED on network failure.
 */
export function OnboardingRetryScreen({ gate, reload, onLogout }) {
  const { signOut } = useAuth()
  const isForbidden = gate?.validationState === 'FORBIDDEN'
  const isRevalidating = gate?.validationState === 'REVALIDATION_REQUIRED'

  const title = isForbidden
    ? 'Driver access restricted'
    : isRevalidating
      ? 'Revalidating your driver status'
      : 'Could not verify your driver status'

  const body = isForbidden
    ? gate?.error?.message ?? 'Your account is not currently approved for dispatch. Refresh to check your verification status.'
    : isRevalidating
      ? 'Your trip has ended. We need to confirm your current partner approval before you can go online or accept a new ride.'
      : 'Check your internet connection and try again. New rides and availability require a verified approval status from the server.'

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingVertical: space.md }}>
        <Text style={{ ...type.title, color: colors.text }}>Partner verification</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={async () => {
            await unregisterPush()
            await signOut()
            onLogout?.()
          }}
          style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 10 }}
        >
          <LogOut size={16} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.xl }}>
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
          {isForbidden ? <ShieldCheck size={28} color={colors.red} /> : <WifiOff size={28} color={colors.textMuted} />}
          <Text style={{ ...type.title, color: colors.text, textAlign: 'center' }}>{title}</Text>
          <Text style={{ ...type.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 18 }}>
            {body}
          </Text>
          <Button
            label={gate?.inFlight ? 'Checking status…' : 'Try again'}
            icon={RefreshCw}
            disabled={ Boolean(gate?.inFlight) }
            onPress={() => void reload?.()}
            style={{ alignSelf: 'stretch', marginTop: space.sm }}
          />
        </Card>
      </View>
    </SafeAreaView>
  )
}

/**
 * Reads the separated onboarding, active-trip continuity, and validation state
 * from DriverContext. Never falls back to `APPROVED` on network error.
 */
export function useOnboarding() {
  const { onboardingGate, reloadOnboarding } = useDriver()
  return {
    onboarding: onboardingGate.onboarding,
    gate: onboardingGate,
    reload: reloadOnboarding,
  }
}
