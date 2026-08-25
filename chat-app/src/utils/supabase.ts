// =============================================================================
// ZENTRALER SUPABASE-CLIENT
// Jede Datei importiert genau diese Instanz. Dadurch verwenden Login, Logout und
// Session-Prüfung immer denselben Auth-Zustand.
// =============================================================================

// Ergänzt in React Native fehlende URL-Funktionen, die Supabase intern benötigt.
import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Öffentliche Projekt-URL und Publishable/Anon-Key. Dieser Key darf im Frontend
// stehen; geheime Service-Role-Keys dürfen hier niemals eingetragen werden.
const supabaseUrl = 'https://svjwdxhozkulzgxxyzce.supabase.co/';
const supabaseAnonKey = 'sb_publishable_sPTid52Q5HDa4t3od4qb5Q_36YalKIm';

// =============================================================================
// AUTH-KONFIGURATION
// =============================================================================
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Erneuert einen ablaufenden Access-Token automatisch während die App läuft.
    autoRefreshToken: true,
    // Die Anmeldung gilt nur für die aktuell laufende App.
    // Nach einem vollständigen Neuladen wird wieder die Login-Seite angezeigt.
    persistSession: false,
    // OAuth-Sessionen werden in dieser App nicht aus der URL übernommen.
    detectSessionInUrl: false,
    // Verhindert parallele Auth-Zugriffe, die sich gegenseitig überschreiben.
    lock: processLock,
  },
});

// =============================================================================
// TOKEN-REFRESH AUF IOS UND ANDROID
// Im Browser erledigt Supabase dies selbst. Native Apps pausieren den Refresh,
// wenn sie im Hintergrund liegen, und starten ihn beim Öffnen wieder.
// =============================================================================
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
