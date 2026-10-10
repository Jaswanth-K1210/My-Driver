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
 */
import { useEffect, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Check, ChevronDown, X } from 'lucide-react-native'
import { colors, radius, space, type } from '../../../theme/tokens'

export default function ModalPicker({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  title = 'Select',
  searchable = false,
}) {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [remoteOptions, setRemoteOptions] = useState(null)

  useEffect(() => {
    if (!searchable || !query) {
      setRemoteOptions(null)
      return
    }
    const timer = setTimeout(() => {
      import('../../../lib/apiClient').then(({ api }) => {
        api.locations.search(query).then(results => {
          setRemoteOptions(results.map(r => ({ id: r.id, label: r.name, sublabel: r.address })))
        }).catch(() => {})
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [query, searchable])

  const selected = options.find((o) => o.id === value) || (remoteOptions && remoteOptions.find(o => o.id === value))
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
    setVisible(true)
  }

  return (
    <>
      {/* ─── Trigger Button ─── */}
      <Pressable
        onPress={open}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space.md,
          paddingVertical: 11,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
          gap: space.sm,
        })}
      >
        <Text
          numberOfLines={1}
          style={{
            ...type.body,
            color: selected ? colors.text : colors.textMuted,
            flex: 1,
          }}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={15} color={colors.textMuted} />
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
                    onPress={() => {
                      onChange(item.id)
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
