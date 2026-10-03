/**
 * CarDetailsForm — vehicle selector.
 *
 * Tab 1 "Saved Garage": pick from pre-configured saved vehicles.
 * Tab 2 "New Vehicle": full brand → model → engine type → transmission selectors.
 */
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Car, Check } from 'lucide-react-native'
import {
  CAR_BRANDS,
  ENGINE_TYPES,
  SAVED_GARAGE,
  TRANSMISSIONS,
} from '../../../data/mock'
import { getRecommendedSkillId } from '../../../lib/booking'
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
  const [tab, setTab] = useState('garage') // 'garage' | 'new'

  const carDetails = config.carDetails ?? {}
  const currentBrand = CAR_BRANDS.find((b) => b.company === carDetails.company) ?? CAR_BRANDS[0]

  // ── Saved garage handler ──
  const handleSavedSelect = (car) => {
    const updated = {
      company: car.company,
      model: car.model,
      engineType: car.engineType,
      transmission: car.transmission,
      plate: car.plate,
      isCustom: false,
      savedVehicleId: car.id,
    }
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
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                borderRadius: radius.md - 2,
                backgroundColor: active ? colors.surface : 'transparent',
                shadowColor: active ? '#000' : 'transparent',
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
            <Text style={{ ...type.micro, color: colors.textFaint }}>Pre-configured & verified</Text>
          </View>
          {SAVED_GARAGE.map((car) => {
            const selected = carDetails.savedVehicleId === car.id
            return (
              <Pressable
                key={car.id}
                onPress={() => handleSavedSelect(car)}
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
                  <Car size={16} color={selected ? '#fff' : colors.textMuted} />
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
                    {car.transmission} · {car.engineType} · {car.plate}
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
                        color: active ? '#fff' : colors.text,
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
                    {active ? <Check size={13} color="#fff" /> : null}
                    <Text
                      style={{
                        ...type.caption,
                        color: active ? '#fff' : colors.text,
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
