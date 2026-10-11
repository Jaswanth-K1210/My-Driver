/**
 * CarDetailsForm — vehicle selector.
 *
 * Tab 1 "Saved Garage": pick from the customer's saved vehicles (/v1/me/vehicles).
 * Tab 2 "New Vehicle": full brand → model → engine type → transmission selectors.
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
import ModalPicker from './ModalPicker'

const BRAND_OPTS = CAR_BRANDS.map((b) => ({ id: b.company, label: b.company }))

function modelOptsFor(company) {
  const brand = CAR_BRANDS.find((b) => b.company === company)
  if (!brand) return []
  if (company === 'Other / Custom') return []
  return brand.models.map((m) => ({ id: m, label: m }))
}

function SectionLabel({ children }) {
  return (
    <Text
      style={{
        ...type.micro,
        color: colors.textMuted,
        letterSpacing: 0.5,
        marginBottom: space.sm,
      }}
    >
      {String(children).toUpperCase()}
    </Text>
  )
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
      {/* ─── Tabs ─── */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          padding: 3,
        }}
      >
        {[
          { id: 'garage', label: 'Saved Garage' },
          { id: 'new', label: 'New Vehicle' },
        ].map((t) => {
          const active = tab === t.id
          return (
            <Pressable
              accessibilityRole="button"
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                borderRadius: radius.md - 2,
                backgroundColor: active ? colors.surface : 'transparent',
                shadowColor: active ? colors.graphite : 'transparent',
                shadowOpacity: 0.06,
                shadowRadius: 4,
                elevation: active ? 1 : 0,
              }}
            >
              <Text
                style={{
                  ...type.caption,
                  color: active ? colors.text : colors.textMuted,
                  fontWeight: active ? '800' : '600',
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* ─── Saved Garage Tab ─── */}
      {tab === 'garage' && (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionLabel>My Garage (Saved Vehicles)</SectionLabel>
          </View>
          {garage === null && garageStatus === 'error' ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ ...type.caption, color: colors.textMuted }}>
                Could not load your saved cars. Check your connection, or enter the car under New Vehicle.
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
            <Text style={{ ...type.caption, color: colors.textMuted }}>Loading your cars…</Text>
          ) : garage.length === 0 ? (
            <Text style={{ ...type.caption, color: colors.textMuted }}>
              No saved cars yet. Add one in Profile, or enter the car under New Vehicle.
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
                  padding: space.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: selected ? colors.brand : colors.border,
                  backgroundColor: selected ? colors.brandSoft : colors.surfaceAlt,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.sm,
                    backgroundColor: selected ? colors.brand : colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Car size={16} color={selected ? colors.onRed : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      ...type.bodyBold,
                      color: selected ? colors.brandPressed : colors.text,
                    }}
                    numberOfLines={1}
                  >
                    {car.company} {car.model}
                  </Text>
                  <Text style={{ ...type.tiny, color: colors.textMuted }}>
                    {[car.transmission, car.engine_type, car.plate].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {selected ? <Check size={16} color={colors.brand} /> : null}
              </Pressable>
            )
          })}
        </View>
      )}

      {/* ─── New Vehicle Tab ─── */}
      {tab === 'new' && (
        <View
          style={{
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceAlt,
            padding: space.md,
            gap: space.md,
          }}
        >
          {/* Brand */}
          <View>
            <SectionLabel>Car Brand / Company</SectionLabel>
            <ModalPicker
              value={carDetails.company || CAR_BRANDS[0].company}
              options={BRAND_OPTS}
              onChange={(v) => updateField('company', v)}
              placeholder="Select brand"
              title="Car Brand / Company"
              searchable
            />
          </View>

          {/* Model */}
          <View>
            <SectionLabel>Car Model</SectionLabel>
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
                  paddingVertical: 11,
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
                title="Car Model"
              />
            )}
          </View>

          {/* Engine Type */}
          <View>
            <SectionLabel>Engine Type</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {ENGINE_TYPES.map((eng) => {
                const active = carDetails.engineType === eng
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={eng}
                    onPress={() => updateField('engineType', eng)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: active ? colors.graphite : colors.border,
                      backgroundColor: active ? colors.graphite : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        ...type.caption,
                        color: active ? colors.onGraphite : colors.text,
                        fontWeight: '800',
                      }}
                    >
                      {eng}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Transmission */}
          <View>
            <SectionLabel>Transmission</SectionLabel>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {TRANSMISSIONS.map((trans) => {
                const active = carDetails.transmission === trans
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={trans}
                    onPress={() => updateField('transmission', trans)}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      paddingVertical: 9,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: active ? colors.brand : colors.border,
                      backgroundColor: active ? colors.brand : colors.surface,
                    }}
                  >
                    {active ? <Check size={13} color={colors.onGraphite} /> : null}
                    <Text
                      style={{
                        ...type.caption,
                        color: active ? colors.onGraphite : colors.text,
                        fontWeight: '800',
                      }}
                    >
                      {trans}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
