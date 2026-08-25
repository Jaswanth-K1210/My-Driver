import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Slider from '@react-native-community/slider'
import { Bell, ChevronDown, Gauge, MapPin, Navigation, Search } from 'lucide-react-native'
import { CUSTOMER, DROPS, PICKUP, SKILLS, VISION_MODES } from '../../data/mock'
import { useTrip } from '../../context/TripContext'
import DemoBadge from '../../components/DemoBadge'
import { clamp, formatINR } from '../../lib/utils'
import { colors, radius, space, type } from '../../theme/tokens'
import Button, { Pill } from '../../components/Button'
import Card from '../../components/Card'
import FakeStatusBar from '../../components/StatusBar'
import { useToast } from '../../components/Toast'

function SectionLabel({ children, icon: Icon }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm }}>
      {Icon ? <Icon size={13} color={colors.textMuted} /> : null}
      <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>
        {String(children).toUpperCase()}
      </Text>
    </View>
  )
}

function PlaceList({ onSelect }) {
  return (
    <View style={{ marginTop: space.sm, gap: 2 }}>
      {DROPS.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          onPress={() => onSelect(place)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: 10,
            backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
          })}
        >
          <MapPin size={16} color={colors.red} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ ...type.body, color: colors.text }}>
              {place.name}
            </Text>
            <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
              {place.address}
            </Text>
          </View>
          <Pill label={`${place.distanceKm} km`} />
        </Pressable>
      ))}
    </View>
  )
}

export default function HomeScreen({ config, onChange, onFindDriver }) {
  const { toast } = useToast()
  const [dropOpen, setDropOpen] = useState(false)

  const drop = DROPS.find((d) => d.id === config.dropId) ?? null
  // Rates come from GET /v1/rate-cards, so a price change needs no app release.
  const { skills } = useTrip()
  const skill = skills.find((s) => s.id === config.skillId) ?? SKILLS[0]

  const baseFare = drop ? drop.distanceKm * skill.rate : 0
  const nightFee = config.skillId === 'MD-Night' ? 30 : 0
  const total = baseFare + 19 + nightFee

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FakeStatusBar />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.xl,
          paddingBottom: space.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              backgroundColor: colors.redSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...type.bodyBold, color: colors.red }}>{CUSTOMER.initials}</Text>
          </View>
          <View>
            <Text style={{ ...type.tiny, color: colors.textMuted }}>Good evening</Text>
            <Text style={{ ...type.body, color: colors.text }}>{CUSTOMER.name}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => toast('No new alerts — all trips sealed', 'info')}
          style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, padding: 10 }}
        >
          <Bell size={16} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.lg }}
      >
        <Card>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <MapPin size={16} color={colors.graphite} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>PICKUP</Text>
              <Text numberOfLines={1} style={{ ...type.body, color: colors.text }}>
                {PICKUP.name}
              </Text>
              <Text numberOfLines={1} style={{ ...type.tiny, color: colors.textMuted }}>
                {PICKUP.address}
              </Text>
            </View>
          </View>

          <View
            style={{
              width: 1,
              height: 16,
              backgroundColor: colors.borderStrong,
              marginLeft: 7,
              marginVertical: space.md,
            }}
          />

          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Navigation size={16} color={colors.red} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: dropOpen }}
                onPress={() => setDropOpen((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>DROP</Text>
                  <Text
                    numberOfLines={1}
                    style={{ ...type.body, color: drop ? colors.text : colors.textMuted }}
                  >
                    {drop ? `${drop.name} · ${drop.address}` : 'Where are you heading?'}
                  </Text>
                </View>
                <ChevronDown
                  size={16}
                  color={colors.textMuted}
                  style={{ transform: [{ rotate: dropOpen ? '180deg' : '0deg' }] }}
                />
              </Pressable>
              {dropOpen ? (
                <PlaceList
                  onSelect={(place) => {
                    onChange({ ...config, dropId: place.id })
                    setDropOpen(false)
                  }}
                />
              ) : null}
            </View>
          </View>
        </Card>

        <View>
          <SectionLabel>Skill certification</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm, paddingRight: space.xl }}
          >
            {skills.map((s) => {
              const selected = config.skillId === s.id
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onChange({ ...config, skillId: s.id })}
                  style={{
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: selected ? colors.red : colors.border,
                    backgroundColor: selected ? colors.redSoft : colors.surface,
                    paddingHorizontal: 14,
                    paddingVertical: space.sm,
                  }}
                >
                  <Text style={{ ...type.caption, color: selected ? colors.redPressed : colors.text }}>
                    {s.label}
                  </Text>
                  <Text style={{ ...type.micro, color: colors.textMuted }}>{s.id}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        <Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: space.xs,
            }}
          >
            <SectionLabel icon={Gauge}>Speed ceiling</SectionLabel>
            <Pill label={`${config.ceiling} km/h`} tone={config.ceiling > 80 ? 'brand' : 'safe'} />
          </View>
          <Slider
            minimumValue={40}
            maximumValue={120}
            step={5}
            value={config.ceiling}
            onValueChange={(v) => onChange({ ...config, ceiling: clamp(Math.round(v), 40, 120) })}
            minimumTrackTintColor={colors.red}
            maximumTrackTintColor={colors.surfaceSunken}
            thumbTintColor={colors.red}
            accessibilityLabel={`Speed ceiling ${config.ceiling} kilometres per hour`}
          />
          <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 16 }}>
            Breaches alert you, your guardians and the Safety Desk instantly.
          </Text>
        </Card>

        <View>
          <SectionLabel>VisionCam mode</SectionLabel>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {VISION_MODES.map((mode) => {
              const selected = config.visionMode === mode.id
              return (
                <Pressable
                  key={mode.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onChange({ ...config, visionMode: mode.id })}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: selected ? colors.red : colors.border,
                    backgroundColor: selected ? colors.redSoft : colors.surface,
                    padding: 10,
                  }}
                >
                  <Text style={{ ...type.body, color: selected ? colors.redPressed : colors.text }}>
                    Mode {mode.id}
                  </Text>
                  <Text style={{ ...type.micro, color: colors.textMuted }}>{mode.name}</Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={{ ...type.tiny, color: colors.textMuted, marginTop: 6 }}>
            {VISION_MODES.find((m) => m.id === config.visionMode)?.desc} · sealed into Trip Vault
          </Text>
        </View>

        <Card>
          <SectionLabel>Fare estimate</SectionLabel>
          {[
            ['Trip distance', drop ? `${drop.distanceKm} km` : '--'],
            [`${skill.id} rate`, `${formatINR(skill.rate)}/km`],
            ['Platform fee', formatINR(19)],
            ...(nightFee > 0 ? [['Night monitoring', formatINR(nightFee)]] : []),
          ].map(([label, value]) => (
            <View
              key={label}
              style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}
            >
              <Text style={{ ...type.caption, color: colors.textMuted }}>{label}</Text>
              <Text style={{ ...type.caption, color: colors.text }}>{value}</Text>
            </View>
          ))}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              marginTop: space.sm,
              paddingTop: space.sm,
            }}
          >
            <Text style={{ ...type.bodyBold, color: colors.text }}>Estimated fare</Text>
            <Text style={{ ...type.bodyBold, color: colors.red }}>{drop ? formatINR(total) : '--'}</Text>
          </View>
        </Card>
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
        }}
      >
        <Button
          label={`Find my ${skill.label} driver`}
          icon={Search}
          disabled={!drop}
          onPress={onFindDriver}
        />
        {!drop ? (
          <Text style={{ ...type.tiny, color: colors.textMuted, textAlign: 'center', marginTop: space.sm }}>
            Choose a destination to continue
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
