import { useState } from 'react'
import PhoneFrame from './components/PhoneFrame.jsx'
import { ToastProvider } from './components/Toast.jsx'
import CustomerApp from './screens/customer/CustomerApp.jsx'
import DriverApp from './screens/driver/DriverApp.jsx'

export default function App() {
  const [role, setRole] = useState('customer')

  return (
    <PhoneFrame role={role} onRoleChange={setRole}>
      <ToastProvider>{role === 'customer' ? <CustomerApp /> : <DriverApp />}</ToastProvider>
    </PhoneFrame>
  )
}
