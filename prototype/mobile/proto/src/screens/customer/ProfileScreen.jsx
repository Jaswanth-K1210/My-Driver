import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Fingerprint, Lock, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import Toggle from '../../components/Toggle'
import { useToast } from '../../components/Toast'
import { CUSTOMER, DEFAULT_GUARDIANS, MAX_GUARDIANS } from '../../data/mock'
import { maskPhone } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

const QUICK_ACTIONS = [
  { icon: ShieldCheck, label: 'Safety centre' },
  { icon: UserRound, label: 'Trusted contacts' },
  { icon: Lock, label: 'Privacy' },
]

export default function ProfileScreen() {
  const { toast } = useToast()
  const [guardians, setGuardians] = useState(DEFAULT_GUARDIANS)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [autoSos, setAutoSos] = useState(true)
  const [biometric, setBiometric] = useState(true)
  const [nightWatch, setNightWatch] = useState(true)

  const addGuardian = () => {
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
    setGuardians((prev) => [
      ...prev,
      { id: `g-${Date.now()}`, name: trimmedName, relation: 'Guardian', phone: digits },
    ])
    setName('')
    setPhone('')
    toast('Guardian added', 'success')
  }

  const removeGuardian = (id) => {
    setGuardians((prev) => prev.filter((g) => g.id !== id))
    toast('Guardian removed', 'info')
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
            <Text style={{ ...type.title, color: colors.red }}>{CUSTOMER.initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ ...type.body, color: colors.text }}>
              {CUSTOMER.name}
            </Text>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>
              Member since {CUSTOMER.memberSince} · {CUSTOMER.rating} rating
            </Text>
          </View>
          <Pill label="MD Verified" tone="brand" />
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

        <Card>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6, marginBottom: space.sm }}>
            SAFETY SETTINGS
          </Text>
          <Toggle checked={autoSos} onChange={setAutoSos} label="Silent SOS on triple volume press" />
          <Toggle checked={nightWatch} onChange={setNightWatch} label="Auto guardian-share on night trips" />
          <Toggle checked={biometric} onChange={setBiometric} label="Biometric app lock" />
        </Card>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {QUICK_ACTIONS.map(({ icon: Icon, label }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              onPress={() => toast(`${label} opens here (demo)`, 'info')}
              style={{
                flex: 1,
                alignItems: 'center',
                gap: 6,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: space.md,
              }}
            >
              <Icon size={16} color={colors.red} />
              <Text style={{ ...type.micro, color: colors.text, textAlign: 'center' }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Fingerprint size={12} color={colors.textFaint} />
          <Text style={{ ...type.micro, color: colors.textFaint }}>
            Prototype build · all data is simulated locally
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
