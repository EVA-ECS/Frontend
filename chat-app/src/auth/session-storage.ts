import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthSession } from '../utils/api-client';

const SESSION_KEY = 'eva.auth.session';

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AuthSession>;

  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    !!candidate.user &&
    typeof candidate.user.userId === 'string' &&
    typeof candidate.user.email === 'string'
  );
}

async function readRawSession(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(SESSION_KEY);
  }

  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function loadStoredSession():
  Promise<AuthSession | null> {
  const rawSession = await readRawSession();

  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as unknown;

    if (!isAuthSession(parsed)) {
      await clearStoredSession();
      return null;
    }

    return parsed;
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function saveStoredSession(
  session: AuthSession
): Promise<void> {
  const serialized = JSON.stringify(session);

  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(
      SESSION_KEY,
      serialized
    );
    return;
  }

  await SecureStore.setItemAsync(
    SESSION_KEY,
    serialized,
    {
      keychainAccessible:
        SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }
  );
}

export async function clearStoredSession():
  Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_KEY);
}