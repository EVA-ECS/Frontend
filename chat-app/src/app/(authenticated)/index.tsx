// =============================================================================
// STARTSEITE DES ANGEMELDETEN BEREICHS
// Diese sehr kleine Route verbindet Expo Router mit dem eigentlichen Chat-Layout.
// =============================================================================

import ChatWorkspace from '../../components/chat-workspace';

export default function HomeScreen() {
  // Die komplette sichtbare Chat-Oberfläche liegt in einer eigenen Komponente.
  return <ChatWorkspace />;
}
