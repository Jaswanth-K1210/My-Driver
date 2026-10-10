import { useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CreditCard, Lock } from 'lucide-react-native'
import Button from '../../components/Button'
import Card from '../../components/Card'
import { colors, radius, space, type } from '../../theme/tokens'

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Between booking and dispatch: the fare hold must be authorized first. */
export default function PaymentScreen({ payment, trip, onPay, onCancel }) {
  const [opening, setOpening] = useState(false)
  const failed = payment.status === 'FAILED'

  const pay = async () => {
    setOpening(true)
    try {
      await onPay()
    } finally {
      setOpening(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.xl }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <View style={{ width: 64, height: 64, borderRadius: radius.xl, backgroundColor: colors.redSoft, alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={28} color={colors.red} />
          </View>
          <Text style={{ ...type.headline, color: colors.text }}>Confirm and pay</Text>
          {trip?.from ? (
            <Text numberOfLines={2} style={{ ...type.caption, color: colors.textMuted, textAlign: 'center' }}>
              {trip.from}{trip.to ? ` → ${trip.to}` : ''}
            </Text>
          ) : null}
        </View>

        <Card style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 34, fontWeight: '900', color: colors.text, fontVariant: ['tabular-nums'] }}>
            {rupees(payment.amount_authorized)}
          </Text>
          <Text style={{ ...type.micro, color: colors.textMuted, letterSpacing: 0.6 }}>REFUNDABLE HOLD</Text>
          <Text style={{ ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md, lineHeight: 18 }}>
            We hold the quoted fare now and charge the final fare when your trip ends. If you cancel, or no
            driver is available, the hold is released.
          </Text>
        </Card>

        {failed ? (
          <Card tone="alert">
            <Text style={{ ...type.caption, color: colors.redPressed }}>
              {payment.failure_reason ?? 'That payment did not go through.'} Please try again.
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: space.sm }}>
          <Button label={opening ? 'Opening checkout…' : failed ? 'Try payment again' : 'Pay securely'} icon={Lock} onPress={pay} disabled={opening} />
          <Button label="Cancel booking" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </SafeAreaView>
  )
}
