import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LogOut, Plus, Trash2 } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/apiClient'
import { toE164 } from '../../lib/phone'
import { useAuth } from '../../context/AuthContext'
import { maskPhone } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

const inputBase = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  backgroundColor: colors.surfaceAlt,
  paddingHorizontal: space.md,
  paddingVertical: 10,
  ...type.body,
  color: colors.text,
}

/**
 * Optional for riders: a verified identity earns the "ID verified" badge that
 * drivers and the Safety Desk can see. Same PAN + Aadhaar OTP flow as drivers.
 */
function IdentityCard() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [pan, setPan] = useState('')
  const [name, setName] = useState(user?.full_name ?? '')
  const [aadhaar, setAadhaar] = useState('')
  const [refId, setRefId] = useState(null)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => api.kyc.status().then(setStatus).catch(() => undefined), [])
  useEffect(() => {
    void reload()
  }, [reload])

  const run = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok, 'success')
      await reload()
    } catch (err) {
      toast(err?.message ?? 'Verification failed', 'warning')
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null
  const panDone = status.pan.status === 'VERIFIED'
  const aadhaarDone = status.aadhaar.status === 'VERIFIED'

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>IDENTITY · OPTIONAL</Text>
        {status.verified ? <Pill label="VERIFIED" tone="safe" /> : null}
      </View>
      {status.verified ? (
        <Text style={{ ...type.caption, color: colors.textMuted }}>
          PAN ending {status.pan.last4} and Aadhaar ending {status.aadhaar.last4} are verified.
        </Text>
      ) : (
        <>
          <Text style={{ ...type.caption, color: colors.textMuted, lineHeight: 18 }}>
            Verify your identity to show an ID-verified badge to your driver. We store only the last four characters.
          </Text>
          {panDone ? (
            <Text style={{ ...type.body, color: colors.text }}>✓ PAN ending {status.pan.last4}</Text>
          ) : (
            <View style={{ gap: space.sm }}>
              <TextInput style={inputBase} placeholder="Name as on PAN" placeholderTextColor={colors.textFaint} value={name} onChangeText={setName} />
              <TextInput
                style={[inputBase, { letterSpacing: 2 }]}
                placeholder="PAN, e.g. ABCPE1234F"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                value={pan}
                onChangeText={(v) => setPan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
              />
              <Button
                label="Verify PAN"
                variant="subtle"
                disabled={busy || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) || name.trim().length < 2}
                onPress={() => run(() => api.kyc.verifyPan(pan, name.trim()), 'PAN verified')}
              />
            </View>
          )}
          {aadhaarDone ? (
            <Text style={{ ...type.body, color: colors.text }}>✓ Aadhaar ending {status.aadhaar.last4}</Text>
          ) : !refId ? (
            <View style={{ gap: space.sm }}>
              <TextInput
                style={[inputBase, { letterSpacing: 2 }]}
                placeholder="12-digit Aadhaar number"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                value={aadhaar}
                onChangeText={(v) => setAadhaar(v.replace(/\D/g, '').slice(0, 12))}
              />
              <Button
                label="Send Aadhaar OTP"
                variant="subtle"
                disabled={busy || aadhaar.length !== 12}
                onPress={() => run(async () => setRefId((await api.kyc.requestAadhaarOtp(aadhaar)).ref_id), 'OTP sent to your Aadhaar-linked mobile')}
              />
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <TextInput
                style={[inputBase, { letterSpacing: 6, textAlign: 'center' }]}
                placeholder="6-digit OTP"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
              />
              <Button
                label="Verify Aadhaar"
                variant="subtle"
                disabled={busy || otp.length !== 6}
                onPress={() => run(() => api.kyc.verifyAadhaarOtp(refId, otp), 'Aadhaar verified')}
              />
            </View>
          )}
        </>
      )}
    </Card>
  )
}

const MAX_GUARDIANS = 5


export default function ProfileScreen({ onLogout }) {
  const { toast } = useToast()
  const { user, signOut } = useAuth()
  const [guardians, setGuardians] = useState([])
  const [kycVerified, setKycVerified] = useState(false)
  useEffect(() => {
    api.kyc.status().then((k) => setKycVerified(k.verified)).catch(() => undefined)
  }, [])

  const reloadGuardians = useCallback(async () => {
    try {
      setGuardians(await api.me.guardians.list())
    } catch {
      setGuardians([])
    }
  }, [])

  useEffect(() => {
    void reloadGuardians()
  }, [reloadGuardians])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const addGuardian = async () => {
    const trimmedName = name.trim()
    const digits = phone.replace(/\D/g, '')
    if (!trimmedName) {
      toast('Enter guardian name', 'warning')
      return
    }
    if (digits.length !== 10) {
      toast('Enter a valid 10-digit mobile number', 'warning')
      return
    }
    if (guardians.length >= MAX_GUARDIANS) {
      toast(`Up to ${MAX_GUARDIANS} guardians allowed`, 'warning')
      return
    }
    try {
      await api.me.guardians.add({
        name: trimmedName,
        relation: 'Guardian',
        phone: toE164(digits),
      })
      await reloadGuardians()
      setName('')
      setPhone('')
      toast('Guardian added', 'success')
    } catch (err) {
      toast(err?.message ?? 'Could not add that guardian', 'warning')
    }
  }

  const removeGuardian = async (id) => {
    try {
      await api.me.guardians.remove(id)
      await reloadGuardians()
      toast('Guardian removed', 'info')
    } catch (err) {
      toast(err?.message ?? 'Could not remove that guardian', 'warning')
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    ...type.body,
    color: colors.text,
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md }}>
        <Text style={{ ...type.headline, color: colors.text }}>Profile</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg }}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.pill,
              backgroundColor: colors.redSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...type.title, color: colors.red }}>
              {(user?.full_name ?? 'MD').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ ...type.body, color: colors.text }}>
              {user?.full_name ?? user?.phone_number ?? 'MyDriver rider'}
            </Text>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>
              {user?.phone_number ?? ''}
            </Text>
          </View>
          {kycVerified ? <Pill label="ID verified" tone="safe" /> : null}
        </Card>

        <Card>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6, marginBottom: space.md }}>
            {`GUARDIANS · ${guardians.length}/${MAX_GUARDIANS}`}
          </Text>

          <View style={{ gap: space.sm }}>
            {guardians.map((g) => (
              <View
                key={g.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceAlt,
                  padding: space.md,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...type.caption, color: colors.text }}>{g.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ ...type.body, color: colors.text }}>
                    {g.name}
                  </Text>
                  <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
                    {g.relation} · {maskPhone(g.phone)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${g.name}`}
                  onPress={() => removeGuardian(g.id)}
                  style={{ padding: 8 }}
                >
                  <Trash2 size={16} color={colors.red} />
                </Pressable>
              </View>
            ))}
          </View>

          {guardians.length < MAX_GUARDIANS ? (
            <View style={{ gap: space.sm, marginTop: space.md }}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Guardian name"
                placeholderTextColor={colors.textFaint}
                maxLength={40}
                accessibilityLabel="Guardian name"
                style={inputStyle}
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <TextInput
                  value={phone}
                  onChangeText={(v) => setPhone(v.replace(/[^\d]/g, '').slice(0, 10))}
                  placeholder="10-digit mobile"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                  accessibilityLabel="Guardian mobile number"
                  style={[inputStyle, { flex: 1 }]}
                />
                <Button label="Add" icon={Plus} onPress={addGuardian} accessibilityLabel="Add guardian" />
              </View>
            </View>
          ) : null}
        </Card>

        <IdentityCard />

        <Button
          label="Log out"
          icon={LogOut}
          variant="outline"
          onPress={async () => {
            await signOut()
            onLogout?.()
          }}
          accessibilityLabel="Log out of MyDriver"
        />

      </ScrollView>
    </SafeAreaView>
  )
}
