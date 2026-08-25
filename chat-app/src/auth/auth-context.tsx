// =============================================================================
// AUTH-KONTEXT: GEMEINSAMER LOGIN-STATUS DER APP
// Hier wird die Supabase-Session einmal zentral verwaltet und allen Seiten über
// useAuth() bereitgestellt. Dadurch muss nicht jede Seite Supabase selbst prüfen.
// =============================================================================

import type { Session } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '../utils/supabase';

// Beschreibt alle Werte und Funktionen, die useAuth() zurückgeben darf.
type AuthContextValue = {
  // Markiert die einmalige Login-Meldung als bereits verarbeitet.
  consumeLoginSuccess: () => void;
  // Ist true, solange die Session beim App-Start noch geprüft wird.
  isLoading: boolean;
  // Ist nur nach einem echten erfolgreichen Login kurzzeitig true.
  loginSuccessPending: boolean;
  // Wird von der Loginseite nach erfolgreicher Supabase-Anmeldung aufgerufen.
  markLoginSuccessful: () => void;
  // Enthält Benutzer und Token; null bedeutet: nicht angemeldet.
  session: Session | null;
};

// undefined als Startwert hilft dabei, eine falsche Nutzung außerhalb des
// AuthProviders früh mit einer verständlichen Fehlermeldung zu erkennen.
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// =============================================================================
// AUTH-PROVIDER: SESSION LADEN UND AKTUELL HALTEN
// =============================================================================
export function AuthProvider({ children }: { children: ReactNode }) {
  // Zentraler Zustand für Session, Ladephase und einmalige Login-Rückmeldung.
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginSuccessPending, setLoginSuccessPending] = useState(false);

  // Beim ersten Mount werden zwei Dinge eingerichtet:
  // 1. onAuthStateChange reagiert zukünftig auf Login, Logout und Token-Refresh.
  // 2. getSession liest die Session, die beim Start bereits vorhanden sein könnte.
  useEffect(() => {
    let isMounted = true;

    // Dauerhafte Verbindung zu allen späteren Auth-Änderungen.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession);
      setIsLoading(false);
    });

    // Einmalige Prüfung direkt beim Start des Providers.
    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;

      setSession(data.session);
      setIsLoading(false);
    });

    // Cleanup: Beim Entfernen des Providers darf kein alter Listener weiterlaufen.
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // =============================================================================
  // EINMALIGE ERFOLGSMELDUNG NACH EINEM ECHTEN LOGIN
  // Diese Funktionen verhindern, dass Fast Refresh die Meldung erneut auslöst.
  // =============================================================================
  const markLoginSuccessful = useCallback(() => {
    setLoginSuccessPending(true);
  }, []);

  const consumeLoginSuccess = useCallback(() => {
    setLoginSuccessPending(false);
  }, []);

  // useMemo hält das Context-Objekt stabil und vermeidet unnötige Neuberechnungen.
  const value = useMemo(
    () => ({
      consumeLoginSuccess,
      isLoading,
      loginSuccessPending,
      markLoginSuccessful,
      session,
    }),
    [
      consumeLoginSuccess,
      isLoading,
      loginSuccessPending,
      markLoginSuccessful,
      session,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// =============================================================================
// HILFS-HOOK FÜR SEITEN UND KOMPONENTEN
// Beispiel: const { session } = useAuth();
// =============================================================================
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.');
  }

  return context;
}
