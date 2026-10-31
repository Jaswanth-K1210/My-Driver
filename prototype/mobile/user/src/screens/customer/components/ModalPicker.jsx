/**
 * ModalPicker — a bottom-sheet style picker for React Native.
 * Replaces the broken absolute-positioned dropdown that caused z-index overlapping.
 *
 * Props:
 *   value        — currently selected option id
 *   options      — [{ id, label, sublabel? }]
 *   onChange     — (id: string) => void
 *   placeholder  — text when nothing selected
 *   title        — modal header title
 *   searchable   — show a search input (for long lists)
 *   placeSearch  — also search live places through the backend (location pickers only)
 *   label        — optional small label shown inside the field, above the value
 *   currentLocation — offer "Use my current location" at the top of the sheet
 *   autoDetect   — fill in the current location once on first show, while the
 *                  value is still the default pickup (pickup field only)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Location from 'expo-location'
import { Check, ChevronDown, LocateFixed, X } from 'lucide-react-native'
import { colors, radius, space, type } from '../../../theme/tokens'
import { api } from '../../../lib/apiClient'
import { DEFAULT_CONFIG, getLocationById, registerPlace } from '../../../lib/booking'

/**
 * Names a GPS position through the backend's locations proxy, as the website
 * does: the phone never calls a geocoder directly. If the lookup fails, the
 * coordinates themselves are the label.
 */
async function reverseGeocode(lat, lng) {
  try {
    const place = await api.locations.reverse({ lat, lng })
    return { name: `Current location (${place.name})`, address: place.address }
  } catch {
    return {
      name: `Current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      address: `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    }
  }
}

// Kept across re-renders so the customer is only asked once automatically.
let cachedGpsPlace = null
let autoDetectAttempted = false

export default function ModalPicker({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  title = 'Select',
  searchable = false,
  placeSearch = false,
  label,
  currentLocation = false,
  autoDetect = false,
}) {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [remoteOptions, setRemoteOptions] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)

  const locateMe = useCallback(
    async ({ silent = false } = {}) => {
      setLocating(true)
      setLocateError(null)
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          if (!silent) {
            setLocateError('Location permission was denied. Allow it in Settings, or search for your pickup.')
          }
          return
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        const { latitude: lat, longitude: lng } = pos.coords
        const geo = await reverseGeocode(lat, lng)
        const place = { id: `gps_${lat.toFixed(5)}_${lng.toFixed(5)}`, name: geo.name, address: geo.address, lat, lng }
        cachedGpsPlace = place
        onChange(registerPlace(place))
        setVisible(false)
        setQuery('')
      } catch {
        if (!silent) setLocateError('Could not read your location. Search for your pickup instead.')
      } finally {
        setLocating(false)
      }
    },
    [onChange],
  )

  // Once per mount, and only over the untouched default: re-running on `value`
  // would undo a deliberate pick.
  const autoAppliedRef = useRef(false)
  useEffect(() => {
    if (!autoDetect || autoAppliedRef.current) return
    autoAppliedRef.current = true
    if (value !== DEFAULT_CONFIG.pickupId) return
    if (cachedGpsPlace) {
      onChange(registerPlace(cachedGpsPlace))
      return
    }
    if (autoDetectAttempted) return
    autoDetectAttempted = true
    void locateMe({ silent: true })
  }, [autoDetect, onChange, locateMe, value])

  useEffect(() => {
    if (!placeSearch || query.trim().length < 2) {
      setRemoteOptions(null)
      return undefined
    }
    // A slow response for an older query must not overwrite a newer one.
    let stale = false
    const timer = setTimeout(() => {
      api.locations
        .search(query.trim())
        .then(({ results }) => {
          if (stale) return
          setRemoteOptions(results.map((r) => ({ id: r.id, label: r.name, sublabel: r.address, place: r })))
        })
        .catch(() => {
          // Search is an enhancement: fall back to filtering the built-in list.
          if (!stale) setRemoteOptions(null)
        })
    }, 300)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query, placeSearch])

  // A searched place is not in `options`, so resolve its label from the registry.
  const searchedPlace = (placeSearch || currentLocation) && value ? getLocationById(value) : null
  const selected =
    options.find((o) => o.id === value) ||
    (searchedPlace ? { id: searchedPlace.id, label: searchedPlace.name, sublabel: searchedPlace.address } : null)
  const filtered = remoteOptions ? remoteOptions : (
    searchable && query
      ? options.filter((o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sublabel && o.sublabel.toLowerCase().includes(query.toLowerCase()))
        )
      : options
  )

  const open = () => {
    setQuery('')
    setLocateError(null)
    setVisible(true)
  }

  return (
    <>
      {/* ─── Trigger Button ─── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? title}: ${selected ? selected.label : placeholder}`}
        onPress={open}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space.md,
          paddingVertical: label ? 9 : 13,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
          gap: space.sm,
        })}
      >
        <View style={{ flex: 1 }}>
          {label ? <Text style={{ ...type.tiny, color: colors.textMuted }}>{label}</Text> : null}
          <Text
            numberOfLines={1}
            style={{
              ...type.body,
              color: selected ? colors.text : colors.textMuted,
            }}
          >
            {selected ? selected.label : placeholder}
          </Text>
        </View>
        <ChevronDown size={16} color={colors.textMuted} />
      </Pressable>

      {/* ─── Bottom-Sheet Modal ─── */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        {/* Scrim */}
        <Pressable
          accessibilityRole="button"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => setVisible(false)}
        />

        {/* Sheet */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '72%',
          }}
        >
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space.lg,
              paddingBottom: space.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ ...type.title, color: colors.text }}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              style={{
                padding: space.sm,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Search Input */}
          {searchable && (
            <View
              style={{
                paddingHorizontal: space.lg,
                paddingVertical: space.sm,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <TextInput
                accessibilityLabel="Search"
                value={query}
                onChangeText={setQuery}
                placeholder="Search..."
                placeholderTextColor={colors.textMuted}
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.text,
                  paddingHorizontal: space.md,
                  paddingVertical: 9,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceAlt,
                }}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>
          )}

          {/* Current location */}
          {currentLocation ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Use my current location"
                accessibilityState={{ busy: locating, disabled: locating }}
                disabled={locating}
                onPress={() => locateMe()}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingHorizontal: space.lg,
                  paddingVertical: 14,
                  backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                })}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <LocateFixed size={18} color={colors.brand} />
                )}
                <Text style={{ ...type.bodyBold, color: colors.brand }}>
                  {locating ? 'Finding your location…' : 'Use my current location'}
                </Text>
              </Pressable>
              {locateError ? (
                <Text style={{ ...type.tiny, color: colors.redPressed, paddingHorizontal: space.lg, paddingBottom: space.md }}>
                  {locateError}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Options */}
          {filtered.length === 0 ? (
            <View style={{ padding: space.xxl, alignItems: 'center' }}>
              <Text style={{ ...type.body, color: colors.textMuted }}>No results found</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => {
                const isSelected = item.id === value
                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(item.place ? registerPlace(item.place) : item.id)
                      setVisible(false)
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: space.lg,
                      paddingVertical: 13,
                      backgroundColor: pressed
                        ? colors.surfaceAlt
                        : isSelected
                        ? colors.brandSoft
                        : 'transparent',
                      borderBottomWidth: 1,
                      borderBottomColor: colors.surfaceSunken,
                      gap: space.sm,
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected ? '800' : '600',
                          color: isSelected ? colors.brand : colors.text,
                        }}
                      >
                        {item.label}
                      </Text>
                      {item.sublabel ? (
                        <Text
                          style={{ ...type.tiny, color: colors.textMuted, marginTop: 2 }}
                          numberOfLines={1}
                        >
                          {item.sublabel}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? <Check size={16} color={colors.brand} /> : null}
                  </Pressable>
                )
              }}
            />
          )}
        </View>
      </Modal>
    </>
  )
}
