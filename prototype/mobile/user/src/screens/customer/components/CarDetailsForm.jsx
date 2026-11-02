/**
 * CarDetailsForm — vehicle selector.
 *
 * Tab 1 "My garage": pick from the customer's saved vehicles (/v1/me/vehicles).
 * Tab 2 "Another car": full brand → model → engine type → transmission selectors.
 */
import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Car, Check } from 'lucide-react-native'
import {
  CAR_BRANDS,
  ENGINE_TYPES,
  TRANSMISSIONS,
} from '../../../data/mock'
import { carDetailsFrom, getRecommendedSkillId } from '../../../lib/booking'
import { useTrip } from '../../../context/TripContext'
import { colors, radius, space, type } from '../../../theme/tokens'
import { Chip, FieldLabel, Segmented } from '../../../components/Form'
import ModalPicker from './ModalPicker'

const BRAND_OPTS = CAR_BRANDS.map((b) => ({ id: b.company, label: b.company }))

function modelOptsFor(company) {
  const brand = CAR_BRANDS.find((b) => b.company === company)
  if (!brand) return []
  if (company === 'Other / Custom') return []
  return brand.models.map((m) => ({ id: m, label: m }))
}

export default function CarDetailsForm({ config, onChange }) {
  // The garage is shared with Profile, where cars are added, edited and removed.
  const { garage, garageStatus, reloadGarage } = useTrip()
  const [tab, setTab] = useState('garage') // 'garage' | 'new'

  // With no saved cars there is nothing to pick from: open the form instead.
  const empty = garage !== null && garage.length === 0
  useEffect(() => {
    if (empty) setTab('new')
  }, [empty])

  const carDetails = config.carDetails ?? {}
  const currentBrand = CAR_BRANDS.find((b) => b.company === carDetails.company) ?? CAR_BRANDS[0]

  // ── Saved garage handler ──
  const handleSavedSelect = (car) => {
    const updated = carDetailsFrom(car)
    onChange({ ...config, carDetails: updated, skillId: getRecommendedSkillId(updated, config.requirement) })
  }

  // ── Custom form handler ──
  const updateField = (field, value) => {
    let updated = { ...carDetails, [field]: value, savedVehicleId: null, isCustom: true }
    if (field === 'company') {
      const brand = CAR_BRANDS.find((b) => b.company === value)
      if (brand && brand.models.length > 0 && value !== 'Other / Custom') {
        updated.model = brand.models[0]
      } else {
        updated.model = ''
      }
    }
    onChange({ ...config, carDetails: updated, skillId: getRecommendedSkillId(updated, config.requirement) })
  }

  const isCustomBrand = carDetails.company === 'Other / Custom'

  return (
    <View style={{ gap: space.md }}>
      <Segmented
        options={[
          { id: 'garage', label: 'My garage' },
          { id: 'new', label: 'Another car' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* ─── Saved Garage Tab ─── */}
      {tab === 'garage' && (
        <View style={{ gap: space.sm }}>
          {garage === null && garageStatus === 'error' ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ ...type.caption, color: colors.textMuted }}>
                Could not load your saved cars. Check your connection, or enter it under Another car.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try loading saved cars again"
                hitSlop={8}
                onPress={reloadGarage}
                style={{ alignSelf: 'flex-start', paddingVertical: 6 }}
              >
                <Text style={{ ...type.bodyBold, color: colors.brand }}>Try again</Text>
              </Pressable>
            </View>
          ) : garage === null ? (
            <Text style={{ ...type.caption, color: colors.textMuted, fontWeight: '500' }}>Loading your cars…</Text>
          ) : garage.length === 0 ? (
            <Text style={{ ...type.caption, color: colors.textMuted }}>
              No saved cars yet. Add one in Profile, or enter it under Another car.
            </Text>
          ) : null}
          {(garage ?? []).map((car) => {
            const selected = carDetails.savedVehicleId === car.id
            return (
              <Pressable
                key={car.id}
                onPress={() => handleSavedSelect(car)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${car.company} ${car.model}${car.plate ? `, ${car.plate}` : ''}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.lg,
                  borderRadius: radius.lg,
                  borderWidth: selected ? 1.5 : 1,
                  borderColor: selected ? colors.brand : colors.border,
                  backgroundColor: selected ? colors.redSofter : colors.surface,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: selected ? colors.brand : colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Car size={18} color={selected ? colors.onRed : colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      ...type.bodyBold,
                      color: colors.text,
                    }}
                    numberOfLines={1}
                  >
                    {car.company} {car.model}
                  </Text>
                  <Text style={{ ...type.tiny, color: colors.textMuted }}>
                    {[car.transmission, car.engine_type, car.plate].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {selected ? <Check size={18} color={colors.brand} /> : null}
              </Pressable>
            )
          })}
        </View>
      )}

      {/* ─── New Vehicle Tab ─── */}
      {tab === 'new' && (
        <View style={{ gap: space.lg, paddingTop: space.xs }}>
          {/* Brand */}
          <View>
            <FieldLabel>Brand</FieldLabel>
            <ModalPicker
              value={carDetails.company || CAR_BRANDS[0].company}
              options={BRAND_OPTS}
              onChange={(v) => updateField('company', v)}
              placeholder="Select brand"
              title="Car brand"
              searchable
            />
          </View>

          {/* Model */}
          <View>
            <FieldLabel>Model</FieldLabel>
            {isCustomBrand ? (
              <TextInput
                accessibilityLabel="Car model"
                value={carDetails.model}
                onChangeText={(v) => updateField('model', v)}
                placeholder="Enter car model"
                placeholderTextColor={colors.textMuted}
                style={{
                  ...type.body,
                  paddingHorizontal: space.md,
                  paddingVertical: 13,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  color: colors.text,
                }}
              />
            ) : (
              <ModalPicker
                value={carDetails.model || currentBrand.models[0]}
                options={modelOptsFor(carDetails.company || CAR_BRANDS[0].company)}
                onChange={(v) => updateField('model', v)}
                placeholder="Select model"
                title="Car model"
              />
            )}
          </View>

          {/* Engine Type */}
          <View>
            <FieldLabel>Engine</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {ENGINE_TYPES.map((eng) => (
                <Chip
                  key={eng}
                  label={eng}
                  active={carDetails.engineType === eng}
                  onPress={() => updateField('engineType', eng)}
                />
              ))}
            </View>
          </View>

          {/* Transmission */}
          <View>
            <FieldLabel>Transmission</FieldLabel>
            <Segmented
              options={TRANSMISSIONS.map((t) => ({ id: t, label: t }))}
              value={carDetails.transmission}
              onChange={(t) => updateField('transmission', t)}
            />
          </View>
        </View>
      )}
    </View>
  )
}
