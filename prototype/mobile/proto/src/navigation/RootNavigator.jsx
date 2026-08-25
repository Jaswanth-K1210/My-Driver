import { useState } from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { ToastProvider } from '../components/Toast'
import { colors } from '../theme/tokens'
import CustomerFlow from '../screens/customer/CustomerFlow'
import DriverFlow from '../screens/driver/DriverFlow'

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.red,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.red,
  },
}

export default function RootNavigator() {
  const [role, setRole] = useState('customer')

  return (
    <NavigationContainer theme={navTheme}>
      <ToastProvider>
        {role === 'customer' ? (
          <CustomerFlow role={role} onRoleChange={setRole} />
        ) : (
          <DriverFlow role={role} onRoleChange={setRole} />
        )}
      </ToastProvider>
    </NavigationContainer>
  )
}
