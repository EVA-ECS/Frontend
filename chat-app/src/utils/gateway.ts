// =============================================================================
// GATEWAY-CLIENT FÜR CHAT-ANFRAGEN
// Diese Datei ist die Verbindung zwischen Frontend und lokalem Gateway.
// Hinweis: Der aktuelle Chat-Workspace nutzt noch lokale Testnachrichten. Diese
// Funktion ist für die spätere echte Backend-Anbindung vorbereitet.
// =============================================================================

import { supabase } from './supabase';

// Zentrale Basisadresse des lokalen Gateway-Servers.
const GATEWAY_URL = 'http://localhost:8080';

export async function sendMessage(text: string) {
  // 1. Aktuelle Supabase-Session und damit den Access-Token lesen.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('User ist nicht eingeloggt.');
  }

  // 2. Nachricht mit Supabase-Token an das geschützte Gateway senden.
  const response = await fetch(`${GATEWAY_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      text,
    }),
  });

  // 3. HTTP-Fehler in einen JavaScript-Fehler umwandeln.
  if (!response.ok) {
    throw new Error(`Gateway antwortet mit ${response.status}`);
  }

  // 4. Erfolgreiche JSON-Antwort an den Aufrufer zurückgeben.
  return response.json();
}
