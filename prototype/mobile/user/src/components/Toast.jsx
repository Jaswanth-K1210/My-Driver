import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Text, View } from 'react-native'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react-native'
import { colors, radius, shadow, space, type } from '../theme/tokens'

const ToastContext = createContext(null)

// Red is the brand colour, so severity is carried by icon + tint rather than
// by hue. Success reads as graphite, not green.
const KIND = {
  success: { Icon: CheckCircle2, fg: colors.graphite, bg: colors.surfaceAlt, border: colors.borderStrong },
  warning: { Icon: AlertTriangle, fg: colors.redPressed, bg: colors.redSoft, border: colors.red },
  danger: { Icon: AlertTriangle, fg: colors.onRed, bg: colors.redDeep, border: colors.redDeep },
  info: { Icon: Info, fg: colors.text, bg: colors.surfaceAlt, border: colors.border },
}

function ToastItem({ message, kind }) {
  const style = KIND[kind] ?? KIND.info
  const { Icon } = style
  const enter = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: true }).start()
  }, [enter])

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          width: '100%',
          borderWidth: 1,
          borderColor: style.border,
          backgroundColor: style.bg,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 10,
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
        shadow.raised,
      ]}
    >
      <Icon size={16} color={style.fg} />
      <Text style={{ ...type.caption, color: style.fg, flex: 1, lineHeight: 17 }}>{message}</Text>
    </Animated.View>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)
  const timersRef = useRef(new Set())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message, kind = 'info', duration = 2800) => {
      idRef.current += 1
      const id = idRef.current
      setToasts((prev) => [...prev.slice(-2), { id, message, kind }])
      const timer = setTimeout(() => {
        timersRef.current.delete(timer)
        dismiss(id)
      }, duration)
      timersRef.current.add(timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: space.lg,
          right: space.lg,
          bottom: 96,
          gap: space.sm,
          alignItems: 'center',
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} message={t.message} kind={t.kind} />
        ))}
      </View>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
