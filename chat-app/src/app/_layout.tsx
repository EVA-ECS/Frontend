// =============================================================================
// ROOT-LAYOUT: ZENTRALE NAVIGATION DER GESAMTEN APP
// Diese Datei entscheidet anhand der Auth-Session, welche Seiten erreichbar sind.
// Die Session wird vom AuthProvider verwaltet und dauerhaft gespeichert. 
// Sie ist der wichtigste Einstiegspunkt von Expo Router.
// =============================================================================

import { Stack } from 'expo-router';

import { AuthProvider, useAuth } from '../auth/auth-context';

// Der AuthProvider liegt um der gesamten Navigation. Dadurch können alle Seiten
// über useAuth() auf den aktuellen Login-Status zugreifen.
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

// Dieser Navigator liest den Auth-Status und schaltet die passende Routengruppe
// frei. Stack.Protected verhindert gleichzeitig den Zugriff auf andere Gruppen.
function RootNavigator() {
  const { isLoading, session } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 1. SESSION WIRD NOCH GEPRÜFT: Nur der Ladebildschirm ist erlaubt. */}
      <Stack.Protected guard={isLoading}>
        <Stack.Screen name="loading" />
      </Stack.Protected>

      {/* 2. NICHT ANGEMELDET: Login und Registrierung sind erreichbar. */}
      <Stack.Protected guard={!isLoading && !session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
      </Stack.Protected>

      {/* 3. ANGEMELDET: Nur die geschützte Chat-Gruppe ist erreichbar. */}
      <Stack.Protected guard={!isLoading && !!session}>
        <Stack.Screen name="(authenticated)" />
      </Stack.Protected>
    </Stack>
  );
}
