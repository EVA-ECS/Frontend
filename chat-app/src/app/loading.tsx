// =============================================================================
// LADESEITE
// Diese Seite wird nur kurz angezeigt, während Supabase die Session prüft.
// So flackert weder die Loginseite noch der Chat vor der Prüfung auf.
// =============================================================================

import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color="#4f46e5" size="large" />
    </View>
  );
}

// Der Ladebildschirm füllt die gesamte Fläche und zentriert den Spinner.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
});
