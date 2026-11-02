import { useEffect, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Award, FileText, LogOut, Moon, Star } from 'lucide-react-native'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import ScoreRing from '../../components/ScoreRing'
import Screen, { Empty, SectionLabel, useLoad } from '../../components/Screen'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useDriver } from '../../context/DriverContext'
import { api } from '../../lib/apiClient'
import { daysUntil, documentLabel, scheduleExpiryReminders, unregisterPush } from '../../lib/push'
import { isDriverProfileComplete, maskPhone } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'

const fetchProfile = () => api.driver.profile()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (iso) => {
  const at = new Date(iso)
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`
}
const dateOnly = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const SHIELD = {
  ACTIVE: { label: 'Active', tone: 'safe' },
  EXPIRED: { label: 'Expired', tone: 'brand' },
  REVOKED: { label: 'Withdrawn', tone: 'brand' },
  NOT_QUALIFIED: { label: 'Not qualified', tone: 'neutral' },
}

function shieldText(n) {
  if (n.status === 'ACTIVE') {
    const left = Math.ceil((new Date(n.expires_at).getTime() - Date.now()) / 86_400_000)
    return `You can take night trips (10 pm – 5 am). Re-verification is due by ${day(n.expires_at)}, in ${left} day${left === 1 ? '' : 's'}.`
  }
  if (n.status === 'EXPIRED') return `Expired on ${day(n.expires_at)}. Night trips are paused until MyDriver re-verifies you.`
  if (n.status === 'REVOKED') return `Withdrawn${n.reason ? `: ${n.reason}` : ''}. Contact MyDriver support.`
  return 'Needs 6 months with MyDriver and a score of 85 or more. Until then you are not offered night trips.'
}

/** What a driver needs to know about one document, worst news first. */
function documentState(doc) {
  if (doc.status === 'REJECTED') {
    return { label: 'Rejected', tone: 'brand', text: doc.reject_reason ?? 'Upload it again.', urgent: true }
  }
  if (doc.expires_on) {
    const left = daysUntil(doc.expires_on)
    if (doc.status === 'EXPIRED' || left < 0) {
      return { label: 'Expired', tone: 'brand', text: `Expired on ${dateOnly(doc.expires_on)}. Upload the renewed document.`, urgent: true }
    }
    if (left <= 30) {
      return {
        label: left === 0 ? 'Expires today' : `${left} day${left === 1 ? '' : 's'} left`,
        tone: 'brand',
        text: `Expires on ${dateOnly(doc.expires_on)}. Renew it to keep receiving trips.`,
        urgent: true,
      }
    }
  }
  const validity = doc.expires_on ? `Valid until ${dateOnly(doc.expires_on)}` : 'No expiry date'
  return doc.status === 'VERIFIED'
    ? { label: 'Verified', tone: 'safe', text: validity, urgent: false }
    : { label: 'Under review', tone: 'neutral', text: validity, urgent: false }
}

/** PAN and Aadhaar are verified through the KYC provider, not by a photo. */
const RENEWABLE = ['DRIVING_LICENCE', 'POLICE_VERIFICATION', 'PHOTO', 'ADDRESS_PROOF']

/** "DD/MM/YYYY" to "YYYY-MM-DD", or null unless it is a real date after today. */
function parseExpiry(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const at = new Date(Date.UTC(y, mo - 1, d))
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null
  const ymd = `${m[3]}-${m[2]}-${m[1]}`
  return daysUntil(ymd) > 0 ? ymd : null
}

const asDateInput = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}

/**
 * Upload a replacement for a document that is expiring, expired or rejected.
 * It goes to the ops team for review; the earlier document keeps its status
 * until then, so renewing early never interrupts trips.
 */
function RenewDocument({ doc, onDone }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [expiry, setExpiry] = useState('')
  const [busy, setBusy] = useState(false)
  // A document that carried an expiry date needs the new one.
  const needsExpiry = Boolean(doc.expires_on) || doc.kind === 'DRIVING_LICENCE'
  const expiresOn = parseExpiry(expiry)
  const ready = !needsExpiry || Boolean(expiresOn)
  const label = documentLabel(doc.kind)

  if (!open) {
    return (
      <Button
        label={doc.status === 'REJECTED' ? 'Upload again' : 'Upload renewed document'}
        variant="outline"
        onPress={() => setOpen(true)}
        style={{ marginTop: space.sm, paddingVertical: 10 }}
      />
    )
  }

  const pick = async (fromCamera) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      toast(fromCamera ? `Allow camera access to photograph your ${label}` : `Allow photo access to upload your ${label}`, 'warning')
      return
    }
    const opts = { base64: true, quality: 0.7, mediaTypes: ['images'] }
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
    if (res.canceled || !res.assets?.[0]?.base64) return

    setBusy(true)
    try {
      await api.driver.uploadDocument(doc.kind, res.assets[0].base64, {
        ...(doc.number_last4 ? { number_last4: doc.number_last4 } : {}),
        ...(expiresOn ? { expires_on: expiresOn } : {}),
      })
      toast('Uploaded. Our team will review it.', 'success')
      setOpen(false)
      setExpiry('')
      onDone()
    } catch (err) {
      toast(err?.message ?? 'Upload failed. Try again.', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: space.sm, marginTop: space.sm }}>
      {needsExpiry && (
        <>
          <TextInput
            value={expiry}
            onChangeText={(v) => setExpiry(asDateInput(v))}
            placeholder="New expiry date, DD/MM/YYYY"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            maxLength={10}
            accessibilityLabel={`New expiry date of your ${label}`}
            style={{
              borderWidth: 1,
              borderColor: expiry.length === 10 && !expiresOn ? colors.red : colors.border,
              borderRadius: radius.md,
              paddingHorizontal: space.md,
              paddingVertical: 12,
              fontSize: 15,
              color: colors.text,
              backgroundColor: colors.surface,
            }}
          />
          {expiry.length === 10 && !expiresOn ? (
            <Text style={{ ...type.micro, color: colors.redPressed }}>Enter a real date after today.</Text>
          ) : null}
        </>
      )}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button
          style={{ flex: 1, paddingVertical: 10 }}
          label={busy ? 'Uploading…' : 'Take photo'}
          disabled={busy || !ready}
          onPress={() => pick(true)}
        />
        <Button
          style={{ flex: 1, paddingVertical: 10 }}
          label="Choose photo"
          variant="subtle"
          disabled={busy || !ready}
          onPress={() => pick(false)}
        />
      </View>
    </View>
  )
}

const inputStyle = (invalid = false) => ({
  borderWidth: 1,
  borderColor: invalid ? colors.red : colors.border,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 11,
  fontSize: 15,
  color: colors.text,
  backgroundColor: colors.surface,
})

function DriverDetailsCard({ profile, setupMode, onSaved }) {
  const { toast } = useToast()
  const { updateDriverProfile } = useDriver()
  const incomplete = !isDriverProfileComplete(profile)
  const [editing, setEditing] = useState(Boolean(setupMode || incomplete))
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [email, setEmail] = useState(profile.email ?? '')
  const [vehicleModel, setVehicleModel] = useState(profile.vehicle_model ?? '')
  const [vehiclePlate, setVehiclePlate] = useState(profile.vehicle_plate ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFullName(profile.full_name ?? '')
    setEmail(profile.email ?? '')
    setVehicleModel(profile.vehicle_model ?? '')
    setVehiclePlate(profile.vehicle_plate ?? '')
    if (incomplete || setupMode) {
      setEditing(true)
    }
  }, [profile.full_name, profile.email, profile.vehicle_model, profile.vehicle_plate, incomplete, setupMode])

  // D-3: only the name is required. The vehicle fields are optional, but the
  // server rejects values shorter than 2 characters, so a blank one is left out.
  const model = vehicleModel.trim()
  const plate = vehiclePlate.trim().toUpperCase()
  const optionalOk = (v) => v.length === 0 || v.length >= 2
  const canSave = fullName.trim().length >= 2 && optionalOk(model) && optionalOk(plate) && !saving

  const save = async () => {
    if (!canSave) {
      toast('Enter your full name. Vehicle model and plate, if given, need at least 2 characters.', 'warning')
      return
    }
    setSaving(true)
    try {
      await updateDriverProfile({
        full_name: fullName.trim(),
        email: email.trim() || null,
        ...(model ? { vehicle_model: model } : {}),
        ...(plate ? { vehicle_plate: plate } : {}),
      })
      toast('Driver profile saved', 'success')
      setEditing(false)
      onSaved?.()
    } catch (err) {
      toast(err?.message ?? 'Could not save profile details', 'warning')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card tone={incomplete ? 'alert' : undefined} style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.bodyBold, color: incomplete ? colors.redPressed : colors.text }}>
            {incomplete ? 'Complete your driver profile' : 'Driver & vehicle details'}
          </Text>
          <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 2 }}>
            {incomplete
              ? 'Required before going online — shown to customers on the live trip screen.'
              : 'Displayed to customers when you accept and start a trip.'}
          </Text>
        </View>
        {!editing && (
          <Button
            label="Edit"
            variant="outline"
            onPress={() => setEditing(true)}
            style={{ paddingVertical: 6, paddingHorizontal: 14 }}
          />
        )}
      </View>

      {!editing ? (
        <View
          style={{
            gap: 6,
            marginTop: space.xs,
            paddingTop: space.sm,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>Full name</Text>
            <Text style={{ ...type.caption, color: colors.text, fontWeight: '600' }}>
              {profile.full_name || '—'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>Email</Text>
            <Text style={{ ...type.caption, color: colors.text }}>
              {profile.email || 'Not set'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>Primary vehicle / class</Text>
            <Text style={{ ...type.caption, color: colors.text, fontWeight: '600' }}>
              {profile.vehicle_model || '—'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>Plate / licence ref</Text>
            <Text style={{ ...type.caption, color: colors.text, fontWeight: '600' }}>
              {profile.vehicle_plate || '—'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: space.sm, marginTop: space.xs }}>
          <View style={{ gap: 4 }}>
            <Text style={{ ...type.micro, color: colors.textMuted }}>FULL NAME *</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Ramesh Kumar"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="words"
              style={inputStyle(false)}
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ ...type.micro, color: colors.textMuted }}>EMAIL (OPTIONAL)</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. ramesh@mydriver.co.in"
              placeholderTextColor={colors.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              style={inputStyle(false)}
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ ...type.micro, color: colors.textMuted }}>VEHICLE MODEL / DRIVING CLASS (OPTIONAL)</Text>
            <TextInput
              value={vehicleModel}
              onChangeText={setVehicleModel}
              placeholder="e.g. Maruti Suzuki Swift · Manual/Auto"
              placeholderTextColor={colors.textFaint}
              style={inputStyle(false)}
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ ...type.micro, color: colors.textMuted }}>VEHICLE PLATE / LICENCE REF (OPTIONAL)</Text>
            <TextInput
              value={vehiclePlate}
              onChangeText={(v) => setVehiclePlate(v.toUpperCase())}
              placeholder="e.g. TS09 EZ 4412"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              style={inputStyle(false)}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
            {!incomplete && !setupMode && (
              <Button
                label="Cancel"
                variant="subtle"
                disabled={saving}
                onPress={() => {
                  setFullName(profile.full_name ?? '')
                  setEmail(profile.email ?? '')
                  setVehicleModel(profile.vehicle_model ?? '')
                  setVehiclePlate(profile.vehicle_plate ?? '')
                  setEditing(false)
                }}
                style={{ flex: 1, paddingVertical: 10 }}
              />
            )}
            <Button
              label={saving ? 'Saving…' : incomplete ? 'Save & continue' : 'Save changes'}
              disabled={!canSave}
              onPress={save}
              style={{ flex: 1, paddingVertical: 10 }}
            />
          </View>
        </View>
      )}
    </Card>
  )
}

export default function ProfileScreen({ onLogout, setupMode = false, onSetupDone }) {
  const { signOut } = useAuth()
  const { pushStatus, online, goOnline } = useDriver()
  const load = useLoad(fetchProfile)
  const documents = load.data?.documents

  // The same dates as below, as reminders 30, 7 and 1 day ahead.
  useEffect(() => {
    if (documents) void scheduleExpiryReminders(documents)
  }, [documents])

  return (
    <Screen
      title={setupMode ? 'Set up your profile' : 'Profile'}
      subtitle={
        setupMode
          ? 'Enter your name once before going online'
          : undefined
      }
      load={load}
    >
      {(p) => {
        const shield = SHIELD[p.night_shield.status] ?? SHIELD.NOT_QUALIFIED
        const urgent = p.documents.map((d) => ({ d, s: documentState(d) })).filter((x) => x.s.urgent)
        return (
          <>
            {urgent.length > 0 && (
              <Card tone="alert">
                <Text style={{ ...type.bodyBold, color: colors.redPressed }}>
                  {urgent.length === 1 ? 'A document needs attention' : `${urgent.length} documents need attention`}
                </Text>
                {urgent.map(({ d, s }) => (
                  <Text key={d.id} style={{ ...type.tiny, color: colors.redPressed, marginTop: 4 }}>
                    {capital(documentLabel(d.kind))}: {s.text}
                  </Text>
                ))}
              </Card>
            )}

            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
              <ScoreRing score={Math.round(p.mydriver_score)} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ ...type.title, color: colors.text }}>{p.full_name ?? 'Driver'}</Text>
                {p.phone_number ? (
                  <Text style={{ ...type.tiny, color: colors.textMuted }}>{maskPhone(p.phone_number)}</Text>
                ) : null}
                {p.vehicle_model || p.vehicle_plate ? (
                  <Text style={{ ...type.tiny, color: colors.text }}>
                    {[p.vehicle_model, p.vehicle_plate].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: space.xs }}>
                  <Star size={13} color={colors.red} />
                  <Text style={{ ...type.caption, color: colors.text }}>
                    {p.rating != null
                      ? `${p.rating.toFixed(1)} from ${p.rating_count} rating${p.rating_count === 1 ? '' : 's'}`
                      : 'No ratings yet'}
                  </Text>
                </View>
                <Text style={{ ...type.micro, color: colors.textMuted }}>
                  {p.total_trips} trip{p.total_trips === 1 ? '' : 's'} · with MyDriver since {day(p.joined_at)}
                </Text>
              </View>
            </Card>

            <DriverDetailsCard
              profile={p}
              setupMode={setupMode}
              onSaved={() => {
                load.reload()
                onSetupDone?.()
              }}
            />

            <SectionLabel>Night Shield</SectionLabel>
            <Card style={{ flexDirection: 'row', gap: space.md }}>
              <Moon size={20} color={p.night_shield.status === 'ACTIVE' ? colors.graphite : colors.textMuted} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ ...type.body, color: colors.text, flex: 1 }}>Night Shield</Text>
                  <Pill label={shield.label} tone={shield.tone} />
                </View>
                <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 16 }}>
                  {shieldText(p.night_shield)}
                </Text>
              </View>
            </Card>

            <SectionLabel>Badges</SectionLabel>
            <Card style={{ gap: space.lg }}>
              {p.badges.length === 0 && <Empty>Pass the tests in the Tests tab to earn badges.</Empty>}
              {p.badges.map((b) => (
                <View key={b.code} style={{ flexDirection: 'row', gap: space.md }}>
                  <Award size={20} color={colors.red} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ ...type.body, color: colors.text }}>{b.label}</Text>
                    {b.description ? (
                      <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 16 }}>{b.description}</Text>
                    ) : null}
                    <Text style={{ ...type.micro, color: colors.textMuted }}>
                      Earned {day(b.awarded_at)}
                      {b.expires_at ? ` · valid until ${day(b.expires_at)}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>

            <SectionLabel>Documents</SectionLabel>
            <Card style={{ gap: space.lg }}>
              {p.documents.length === 0 && <Empty>No documents uploaded.</Empty>}
              {p.documents.map((d) => {
                const s = documentState(d)
                return (
                  <View key={d.id} style={{ flexDirection: 'row', gap: space.md }}>
                    <FileText size={20} color={s.urgent ? colors.red : colors.textMuted} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        <Text style={{ ...type.body, color: colors.text, flex: 1 }}>
                          {capital(documentLabel(d.kind))}
                          {d.number_last4 ? ` ••${d.number_last4}` : ''}
                        </Text>
                        <Pill label={s.label} tone={s.tone} />
                      </View>
                      <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 16 }}>{s.text}</Text>
                      {s.urgent && RENEWABLE.includes(d.kind) ? <RenewDocument doc={d} onDone={load.reload} /> : null}
                    </View>
                  </View>
                )
              })}
            </Card>

            {pushStatus.reason === 'permission' && (
              <Card tone="sunken">
                <Text style={{ ...type.bodyBold, color: colors.text }}>Notifications are off</Text>
                <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 4 }}>
                  Allow notifications in Settings so trip requests ring and document reminders reach you.
                </Text>
              </Card>
            )}

            <Button
              label="Log out"
              icon={LogOut}
              variant="subtle"
              onPress={async () => {
                // Otherwise dispatch keeps offering trips to a phone that cannot answer.
                if (online) await goOnline(false).catch(() => undefined)
                await unregisterPush()
                await signOut()
                onLogout?.()
              }}
            />
          </>
        )
      }}
    </Screen>
  )
}
