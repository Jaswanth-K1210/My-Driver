import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MapPin, Navigation, Plus, Minus, RotateCcw } from 'lucide-react-native'
import { CITY_LOCATIONS } from '../../../data/mock'
import { colors, radius, space, type } from '../../../theme/tokens'
import { Pill } from '../../../components/Button'

export function LocationDropdown({ value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.id === value)

  return (
    <View style={{ flex: 1, zIndex: 1 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={{ paddingVertical: space.sm, paddingHorizontal: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}
      >
        <Text style={{ ...type.body, color: selected ? colors.text : colors.textMuted }}>
          {selected ? selected.name : placeholder}
        </Text>
      </Pressable>
      {open && (
        <View style={{ position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: colors.surface, zIndex: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }}>
          {options.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => { onChange(opt.id); setOpen(false) }}
              style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text style={{ ...type.body }}>{opt.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

export default function WithinCityForm({ config, onChange }) {
  const addStop = () => {
    onChange({
      ...config,
      stops: [...(config.stops || []), { id: `stop_${Date.now()}`, locationId: '' }]
    })
  }

  const updateStop = (id, locationId) => {
    onChange({
      ...config,
      stops: config.stops.map(s => s.id === id ? { ...s, locationId } : s)
    })
  }

  const removeStop = (id) => {
    onChange({
      ...config,
      stops: config.stops.filter(s => s.id !== id)
    })
  }

  return (
    <View style={{ gap: space.md }}>
      {/* Pickup */}
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', zIndex: 3 }}>
        <MapPin size={16} color={colors.graphite} />
        <LocationDropdown 
          value={config.pickupId} 
          options={CITY_LOCATIONS} 
          onChange={(v) => onChange({ ...config, pickupId: v })} 
          placeholder="Select pickup" 
        />
      </View>

      {/* Stops */}
      {(config.stops || []).map((stop, i) => (
        <View key={stop.id} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', zIndex: 2 }}>
          <View style={{ width: 16, alignItems: 'center' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong }} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: space.sm }}>
            <LocationDropdown 
              value={stop.locationId} 
              options={CITY_LOCATIONS} 
              onChange={(v) => updateStop(stop.id, v)} 
              placeholder={`Stop ${i + 1}`} 
            />
            <Pressable onPress={() => removeStop(stop.id)} style={{ padding: space.sm, justifyContent: 'center' }}>
              <Minus size={16} color={colors.red} />
            </Pressable>
          </View>
        </View>
      ))}

      {/* Add Stop Button */}
      {(config.stops || []).length < 2 && (
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <View style={{ width: 16 }} />
          <Pressable onPress={addStop} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs }}>
            <Plus size={14} color={colors.brand} />
            <Text style={{ ...type.caption, color: colors.brand }}>Add stop</Text>
          </Pressable>
        </View>
      )}

      {/* Drop */}
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', zIndex: 1 }}>
        <Navigation size={16} color={colors.red} />
        <LocationDropdown 
          value={config.dropId} 
          options={CITY_LOCATIONS} 
          onChange={(v) => onChange({ ...config, dropId: v })} 
          placeholder="Destination" 
        />
      </View>

      {/* Round Trip Toggle */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ ...type.body }}>Return to pickup?</Text>
        <Pressable 
          onPress={() => onChange({ ...config, tripType: config.tripType === 'two_way' ? 'one_way' : 'two_way' })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, backgroundColor: config.tripType === 'two_way' ? colors.brandSoft : colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: config.tripType === 'two_way' ? colors.brand : colors.border }}
        >
          <RotateCcw size={14} color={config.tripType === 'two_way' ? colors.brand : colors.textMuted} />
          <Text style={{ ...type.caption, color: config.tripType === 'two_way' ? colors.brand : colors.textMuted }}>
            {config.tripType === 'two_way' ? 'Round Trip' : 'One Way'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
