// =============================================================================
// LAYOUT DER GESCHÜTZTEN ROUTEN
// Alle Seiten in diesem Ordner gehören zum angemeldeten Bereich der App.
// Der Zugriff wird bereits im Root-Layout über die Supabase-Session geschützt.
// =============================================================================

import { Stack } from 'expo-router';

export default function AppLayout() {
  // Der Header ist deaktiviert, weil das Chat-Layout seinen eigenen Kopfbereich hat.
  return <Stack screenOptions={{ headerShown: false }} />;
}
