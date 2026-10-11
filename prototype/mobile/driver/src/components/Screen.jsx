import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, space, type } from '../theme/tokens'
import Button from './Button'

/** Loads one API call for a screen: { data, error, loading, reload }. */
export function useLoad(fetcher) {
  const [state, setState] = useState({ data: null, error: null, loading: true })

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    try {
      setState({ data: await fetcher(), error: null, loading: false })
    } catch (err) {
      setState((s) => ({ ...s, error: err?.message ?? 'Could not load this', loading: false }))
    }
  }, [fetcher])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload }
}

/**
 * Shell for the between-trips tabs: a title, pull to refresh, and the same
 * loading and error states everywhere.
 */
export default function Screen({ title, subtitle, load, children }) {
  const { data, error, loading, reload } = load
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space.xl, paddingBottom: space.md }}>
        <Text style={{ ...type.headline, color: colors.text }}>{title}</Text>
        {subtitle ? <Text style={{ ...type.tiny, color: colors.textMuted }}>{subtitle}</Text> : null}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg }}
        refreshControl={
          <RefreshControl refreshing={loading && Boolean(data)} onRefresh={reload} tintColor={colors.red} />
        }
      >
        {!data && loading && <ActivityIndicator color={colors.red} style={{ marginTop: space.xxxl }} />}
        {!data && error && (
          <View style={{ alignItems: 'center', gap: space.md, marginTop: space.xxxl }}>
            <Text style={{ ...type.body, color: colors.text, textAlign: 'center' }}>{error}</Text>
            <Button label="Try again" variant="outline" onPress={reload} />
          </View>
        )}
        {data ? children(data) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

export function SectionLabel({ children }) {
  return (
    <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6, marginBottom: -space.sm }}>
      {String(children).toUpperCase()}
    </Text>
  )
}

export function Empty({ children }) {
  return (
    <Text style={{ ...type.tiny, color: colors.textMuted, textAlign: 'center', paddingVertical: space.md }}>
      {children}
    </Text>
  )
}
