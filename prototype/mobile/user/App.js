import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from './src/components/Toast';
import { AuthProvider } from './src/context/AuthContext';
import { wrapApp } from './src/lib/sentry';
import AuthNavigator from './src/navigation/AuthNavigator';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <ToastProvider>
          <AuthNavigator />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default wrapApp(App);
