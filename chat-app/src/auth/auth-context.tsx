import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import {
  ApiError,
  login,
  logout,
  refreshAuthSession,
  type AuthSession,
} from '../utils/api-client';
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from './session-storage';

type AuthContextValue = {
  consumeLoginSuccess: () => void;
  getValidAccessToken: () => Promise<string | null>;
  isLoading: boolean;
  loginSuccessPending: boolean;
  session: AuthSession | null;
  signIn: (
    email: string,
    password: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext =
  createContext<AuthContextValue | undefined>(undefined);

const REFRESH_MARGIN_SECONDS = 60;

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] =
    useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginSuccessPending, setLoginSuccessPending] =
    useState(false);

  const sessionRef = useRef<AuthSession | null>(null);
  const refreshPromiseRef =
    useRef<Promise<AuthSession | null> | null>(null);

  const applySession = useCallback(
    async (nextSession: AuthSession) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      await saveStoredSession(nextSession);
    },
    []
  );

  const clearCurrentSession = useCallback(
    async () => {
      sessionRef.current = null;
      setSession(null);
      await clearStoredSession();
    },
    []
  );

  const refreshCurrentSession = useCallback(
    async (): Promise<AuthSession | null> => {
      const currentSession = sessionRef.current;

      if (!currentSession) {
        return null;
      }

      if (refreshPromiseRef.current) {
        return refreshPromiseRef.current;
      }

      const refreshPromise = (async () => {
        try {
          const nextSession =
            await refreshAuthSession(
              currentSession.refreshToken
            );

          await applySession(nextSession);
          return nextSession;
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.status === 401
          ) {
            await clearCurrentSession();
            return null;
          }

          throw error;
        }
      })();

      refreshPromiseRef.current = refreshPromise;

      try {
        return await refreshPromise;
      } finally {
        if (
          refreshPromiseRef.current === refreshPromise
        ) {
          refreshPromiseRef.current = null;
        }
      }
    },
    [applySession, clearCurrentSession]
  );

  const getValidAccessToken = useCallback(
    async (): Promise<string | null> => {
      const currentSession = sessionRef.current;

      if (!currentSession) {
        return null;
      }

      const now =
        Math.floor(Date.now() / 1000);

      if (
        currentSession.expiresAt >
        now + REFRESH_MARGIN_SECONDS
      ) {
        return currentSession.accessToken;
      }

      const refreshed =
        await refreshCurrentSession();

      return refreshed?.accessToken ?? null;
    },
    [refreshCurrentSession]
  );

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const storedSession =
          await loadStoredSession();

        if (!active) {
          return;
        }

        if (!storedSession) {
          return;
        }

        sessionRef.current = storedSession;
        setSession(storedSession);

        const now =
          Math.floor(Date.now() / 1000);

        if (
          storedSession.expiresAt <=
          now + REFRESH_MARGIN_SECONDS
        ) {
          try {
            await refreshCurrentSession();
          } catch {
            await clearCurrentSession();
          }
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, [
    clearCurrentSession,
    refreshCurrentSession,
  ]);

  useEffect(() => {
    if (!session) {
      return;
    }

    async function refreshWhenNecessary() {
      const currentSession = sessionRef.current;

      if (!currentSession) {
        return;
      }

      const now =
        Math.floor(Date.now() / 1000);

      if (
        currentSession.expiresAt <=
        now + REFRESH_MARGIN_SECONDS
      ) {
        try {
          await refreshCurrentSession();
        } catch (error) {
          console.warn(
            'Session konnte nicht erneuert werden.',
            error
          );
        }
      }
    }

    void refreshWhenNecessary();

    const interval = setInterval(
      refreshWhenNecessary,
      30000
    );

    return () => clearInterval(interval);
  }, [session?.expiresAt, refreshCurrentSession]);

  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        'change',
        (state) => {
          if (state === 'active') {
            void getValidAccessToken().catch(
              (error) => {
                console.warn(
                  'Sessionprüfung fehlgeschlagen.',
                  error
                );
              }
            );
          }
        }
      );

    return () => subscription.remove();
  }, [getValidAccessToken]);

  const signIn = useCallback(
    async (
      email: string,
      password: string
    ) => {
      const nextSession = await login(
        email,
        password
      );

      await applySession(nextSession);
      setLoginSuccessPending(true);
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    const accessToken =
      sessionRef.current?.accessToken;

    try {
      if (accessToken) {
        await logout(accessToken);
      }
    } catch (error) {
      console.warn(
        'Server-Logout fehlgeschlagen; lokale Session wird trotzdem gelöscht.',
        error
      );
    } finally {
      await clearCurrentSession();
    }
  }, [clearCurrentSession]);

  const consumeLoginSuccess = useCallback(() => {
    setLoginSuccessPending(false);
  }, []);

  const value = useMemo(
    () => ({
      consumeLoginSuccess,
      getValidAccessToken,
      isLoading,
      loginSuccessPending,
      session,
      signIn,
      signOut,
    }),
    [
      consumeLoginSuccess,
      getValidAccessToken,
      isLoading,
      loginSuccessPending,
      session,
      signIn,
      signOut,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth muss innerhalb von AuthProvider verwendet werden.'
    );
  }

  return context;
}