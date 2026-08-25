import React, { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import AuthNavigator from './src/navigation/AuthNavigator';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLogin = useCallback(() => {
    setIsLoggedIn(true);
  }, []);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <AuthNavigator isLoggedIn={isLoggedIn} onLogout={handleLogout} />
    </>
  );
}
