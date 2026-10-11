/**
 * GarageCard — the customer's saved cars, in Profile.
 *
 * Add, edit, delete and choose the default car. The same list feeds the
 * booking form's "Saved Garage" tab, where the default car is preselected.
 */
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native'
import { Car, Pencil, Plus, RefreshCw, Star, Trash2 } from 'lucide-react-native'
import Button, { Pill } from '../../../components/Button'
import Card from '../../../components/Card'
import Toggle from '../../../components/Toggle'
import { useToast } from '../../../components/Toast'
import { useTrip } from '../../../context/TripContext'
import { CAR_BRANDS, ENGINE_TYPES, TRANSMISSIONS } from '../../../data/mock'
import { api } from '../../../lib/apiClient'
import { colors, radius, space, type } from '../../../theme/tokens'
import ModalPicker from './ModalPicker'

// The server's limit (users/vehicles.ts MAX_VEHICLES); it also enforces it.
const MAX_VEHICLES = 10
const CUSTOM_BRAND = 'Other / Custom'
const BRAND_OPTS = CAR_BRANDS.map((b) => ({ id: b.company, label: b.company }))

const modelsFor = (company) => CAR_BRANDS.find((b) => b.company === company)?.models ?? []
const isListedBrand = (company) => company !== CUSTOM_BRAND && modelsFor(company).length > 0

const inputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  backgroundColor: colors.surfaceAlt,
  paddingHorizontal: space.md,
  paddingVertical: 12,
  ...type.body,
  color: colors.text,
}

const blank = () => ({
  id: null,
  brand: CAR_BRANDS[0].company,
  company: CAR_BRANDS[0].company,
  model: CAR_BRANDS[0].models[0],
  engine_type: ENGINE_TYPES[0],
  transmission: TRANSMISSIONS[0],
  plate: '',
  nickname: '',
  is_default: false,
})

/** A saved car whose make is not in the app's list is edited as a custom one. */
const draftFrom = (car) => {
  const listed = isListedBrand(car.company) && modelsFor(car.company).includes(car.model)
  return {
    id: car.id,
    brand: listed ? car.company : CUSTOM_BRAND,
    company: car.company,
    model: car.model,
    engine_type: car.engine_type,
    transmission: car.transmission,
    plate: car.plate ?? '',
    nickname: car.nickname ?? '',
    is_default: car.is_default,
  }
}

function Label({ children }) {
  return (
    <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 6 }}>
      {String(children).toUpperCase()}
    </Text>
  )
}

function Chips({ options, value, onChange, label }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map((option) => {
        const active = option === value
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option}
            onPress={() => onChange(option)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: active ? colors.graphite : colors.border,
              backgroundColor: active ? colors.graphite : colors.surface,
            }}
          >
            <Text style={{ ...type.caption, color: active ? colors.onGraphite : colors.text, fontWeight: '800' }}>
              {option}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function CarForm({ draft, setDraft, saving, onSave, onCancel, showDefaultToggle }) {
  const custom = draft.brand === CUSTOM_BRAND
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }))
  const valid = draft.company.trim().length > 0 && draft.model.trim().length > 0

  return (
    <View style={{ gap: space.md }}>
      <View>
        <Label>Make</Label>
        <ModalPicker
          value={draft.brand}
          options={BRAND_OPTS}
          onChange={(brand) =>
            set(
              brand === CUSTOM_BRAND
                ? { brand, company: '', model: '' }
                : { brand, company: brand, model: modelsFor(brand)[0] ?? '' },
            )
          }
          placeholder="Select make"
          title="Car make"
          searchable
        />
      </View>

      {custom ? (
        <View>
          <Label>Make name</Label>
          <TextInput
            value={draft.company}
            onChangeText={(company) => set({ company })}
            placeholder="For example, Jeep"
            placeholderTextColor={colors.textMuted}
            maxLength={60}
            accessibilityLabel="Car make"
            style={inputStyle}
          />
        </View>
      ) : null}

      <View>
        <Label>Model</Label>
        {custom ? (
          <TextInput
            value={draft.model}
            onChangeText={(model) => set({ model })}
            placeholder="For example, Compass"
            placeholderTextColor={colors.textMuted}
            maxLength={60}
            accessibilityLabel="Car model"
            style={inputStyle}
          />
        ) : (
          <ModalPicker
            value={draft.model}
            options={modelsFor(draft.brand).map((m) => ({ id: m, label: m }))}
            onChange={(model) => set({ model })}
            placeholder="Select model"
            title="Car model"
          />
        )}
      </View>

      <View>
        <Label>Fuel</Label>
        <Chips label="Fuel" options={ENGINE_TYPES} value={draft.engine_type} onChange={(engine_type) => set({ engine_type })} />
      </View>

      <View>
        <Label>Gearbox</Label>
        <Chips label="Gearbox" options={TRANSMISSIONS} value={draft.transmission} onChange={(transmission) => set({ transmission })} />
      </View>

      <View>
        <Label>Registration number (optional)</Label>
        <TextInput
          value={draft.plate}
          onChangeText={(v) => set({ plate: v.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 16) })}
          placeholder="TS09 EA 4120"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Registration number"
          style={[inputStyle, { letterSpacing: 1 }]}
        />
      </View>

      <View>
        <Label>Name for this car (optional)</Label>
        <TextInput
          value={draft.nickname}
          onChangeText={(nickname) => set({ nickname })}
          placeholder="For example, Dad's car"
          placeholderTextColor={colors.textMuted}
          maxLength={40}
          accessibilityLabel="Name for this car"
          style={inputStyle}
        />
      </View>

      {showDefaultToggle ? (
        <Toggle
          label="Use this car by default when I book"
          checked={draft.is_default}
          onChange={(is_default) => set({ is_default })}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Cancel" variant="subtle" disabled={saving} onPress={onCancel} style={{ flex: 1 }} />
        <Button
          label={saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add car'}
          disabled={saving || !valid}
          onPress={onSave}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  )
}

export default function GarageCard() {
  const { toast } = useToast()
  const { garage, garageStatus, reloadGarage } = useTrip()
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const cars = garage ?? []

  const save = async () => {
    setSaving(true)
    const body = {
      company: draft.company.trim(),
      model: draft.model.trim(),
      engine_type: draft.engine_type,
      transmission: draft.transmission,
      plate: draft.plate.trim() || null,
      nickname: draft.nickname.trim() || null,
      // Only ever ask to make a car the default; the server keeps exactly one.
      ...(draft.is_default ? { is_default: true } : {}),
    }
    try {
      if (draft.id) await api.me.vehicles.update(draft.id, body)
      else await api.me.vehicles.add(body)
      await reloadGarage()
      toast(draft.id ? 'Car updated' : 'Car added to your garage', 'success')
      setDraft(null)
    } catch (err) {
      toast(err?.message ?? 'Could not save this car', 'warning')
    } finally {
      setSaving(false)
    }
  }

  const act = async (car, fn, done) => {
    setBusyId(car.id)
    try {
      await fn()
      await reloadGarage()
      toast(done, 'success')
    } catch (err) {
      toast(err?.message ?? 'That did not work. Please try again.', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = (car) =>
    Alert.alert(
      'Remove this car?',
      `${car.company} ${car.model}${car.plate ? ` (${car.plate})` : ''} will be removed from your garage. Past trips are not affected.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => act(car, () => api.me.vehicles.remove(car.id), 'Car removed'),
        },
      ],
    )

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
          {garage ? `MY GARAGE · ${cars.length}/${MAX_VEHICLES}` : 'MY GARAGE'}
        </Text>
      </View>

      {draft ? (
        <CarForm
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onSave={save}
          onCancel={() => setDraft(null)}
          // The first car is always the default, and the default cannot be
          // switched off, only moved to another car.
          showDefaultToggle={cars.length > 0 && !cars.find((c) => c.id === draft.id)?.is_default}
        />
      ) : garage === null && garageStatus === 'error' ? (
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
          <Text style={{ ...type.body, color: colors.text }}>Could not load your cars</Text>
          <Text style={{ ...type.caption, color: colors.textMuted, textAlign: 'center' }}>
            Check your connection and try again.
          </Text>
          <Button label="Try again" icon={RefreshCw} variant="subtle" onPress={reloadGarage} />
        </View>
      ) : garage === null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
          <ActivityIndicator color={colors.red} />
          <Text style={{ ...type.caption, color: colors.textMuted }}>Loading your cars</Text>
        </View>
      ) : (
        <>
          {cars.length === 0 ? (
            <View style={{ alignItems: 'center', gap: space.xs, paddingVertical: space.md }}>
              <Car size={24} color={colors.textMuted} />
              <Text style={{ ...type.body, color: colors.text }}>No cars saved yet</Text>
              <Text style={{ ...type.caption, color: colors.textMuted, textAlign: 'center' }}>
                Save your car once and pick it in one tap when you book.
              </Text>
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              {cars.map((car) => {
                const busy = busyId === car.id
                const name = `${car.company} ${car.model}`
                return (
                  <View
                    key={car.id}
                    style={{ borderRadius: radius.md, backgroundColor: colors.surfaceAlt, padding: space.md, gap: space.sm }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: radius.sm,
                          backgroundColor: colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Car size={16} color={colors.text} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ ...type.bodyBold, color: colors.text }}>
                          {car.nickname ? `${car.nickname} · ${name}` : name}
                        </Text>
                        <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
                          {[car.transmission, car.engine_type, car.plate].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {car.is_default ? <Pill label="DEFAULT" tone="brand" /> : null}
                      {busy ? <ActivityIndicator color={colors.red} /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                      {!car.is_default ? (
                        <RowAction
                          icon={Star}
                          label="Make default"
                          hint={`Use ${name} by default when booking`}
                          disabled={busy}
                          onPress={() =>
                            act(car, () => api.me.vehicles.update(car.id, { is_default: true }), `${name} is now your default car`)
                          }
                        />
                      ) : null}
                      <RowAction
                        icon={Pencil}
                        label="Edit"
                        hint={`Edit ${name}`}
                        disabled={busy}
                        onPress={() => setDraft(draftFrom(car))}
                      />
                      <RowAction
                        icon={Trash2}
                        label="Remove"
                        hint={`Remove ${name}`}
                        tone="danger"
                        disabled={busy}
                        onPress={() => confirmDelete(car)}
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          )}
          {cars.length < MAX_VEHICLES ? (
            <Button label="Add a car" icon={Plus} variant="outline" onPress={() => setDraft(blank())} />
          ) : (
            <Text style={{ ...type.caption, color: colors.textMuted }}>
              Your garage is full. Remove a car to add another.
            </Text>
          )}
        </>
      )}
    </Card>
  )
}

function RowAction({ icon: Icon, label, hint, onPress, disabled, tone }) {
  const fg = tone === 'danger' ? colors.redPressed : colors.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 40,
        paddingHorizontal: space.md,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={14} color={fg} />
      <Text style={{ ...type.caption, color: fg }}>{label}</Text>
    </Pressable>
  )
}
