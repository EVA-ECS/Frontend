// =============================================================================
// REGISTRIERUNGSSEITE
// Diese Seite erstellt über Gateway und UserService ein neues Konto. Sie besitzt bewusst das
// gleiche Design und die gleiche Rückmeldungslogik wie die Loginseite.
// =============================================================================

import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { registerAccount } from '../utils/api-client';

// Einheitliches Format für rote Fehler- und grüne Erfolgsmeldungen.
type Feedback = {
  message: string;
  type: 'error' | 'success';
};

export default function RegisterScreen() {
  // =============================================================================
  // ZUSTÄNDE DES REGISTRIERUNGSFORMULARS
  // =============================================================================
  // Drei Eingabewerte plus Ladezustand und sichtbare Rückmeldung.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // =============================================================================
  // REGISTRIERUNGSABLAUF
  // =============================================================================
  async function registerWithEmail() {
    // Leerzeichen am Anfang und Ende der E-Mail entfernen.
    const normalizedEmail = email.trim();

    // 1. Alle Felder müssen ausgefüllt sein.
    if (!normalizedEmail || !password || !passwordConfirmation) {
      setFeedback({
        message: 'Bitte fülle alle Felder aus.',
        type: 'error',
      });
      return;
    }

    // 2. Beide Passwörter müssen identisch sein.
    if (password !== passwordConfirmation) {
      setFeedback({
        message: 'Die Passwörter stimmen nicht überein.',
        type: 'error',
      });
      return;
    }

    // 3. Alte Meldung entfernen und doppelte Klicks verhindern.
    setFeedback(null);
    setLoading(true);

    try {
      const result = await registerAccount(
        normalizedEmail.toLowerCase(),
        password
      );
    
      setFeedback({
        message: result.message,
        type: 'success',
      });
    
      setPassword('');
      setPasswordConfirmation('');
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'Die Registrierung ist fehlgeschlagen.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        {/* KOPFBEREICH: Titel und kurze Erklärung der Seite. */}
        <Text style={styles.title}>Konto erstellen</Text>
        <Text style={styles.subtitle}>Registriere dich für den Chat</Text>

        {/* RÜCKMELDUNG: Fehler rot, erfolgreiche Registrierung grün. */}
        {feedback && (
          <View
            style={[
              styles.feedback,
              feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess,
            ]}
          >
            <Text
              style={[
                styles.feedbackIcon,
                feedback.type === 'error'
                  ? styles.feedbackErrorText
                  : styles.feedbackSuccessText,
              ]}
            >
              {feedback.type === 'error' ? '!' : '✓'}
            </Text>
            <Text
              style={[
                styles.feedbackText,
                feedback.type === 'error'
                  ? styles.feedbackErrorText
                  : styles.feedbackSuccessText,
              ]}
            >
              {feedback.message}
            </Text>
          </View>
        )}

        {/* EINGABEFELD 1: E-Mail des neuen Benutzerkontos. */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>E-Mail</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="email@beispiel.de"
            placeholderTextColor="#9ca3af"
            style={styles.input}
            value={email}
          />
        </View>

        {/* EINGABEFELD 2: Gewünschtes Passwort. */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Passwort</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            style={styles.input}
            value={password}
          />
        </View>

        {/* EINGABEFELD 3: Kontrolliert Tippfehler im Passwort. */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Passwort wiederholen</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setPasswordConfirmation}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            style={styles.input}
            value={passwordConfirmation}
          />
        </View>

        {/* AKTIONEN: Konto erstellen oder zurück zur Loginseite wechseln. */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            disabled={loading}
            onPress={registerWithEmail}
            style={[styles.button, styles.primaryButton]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Konto erstellen</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            disabled={loading}
            onPress={() => router.replace('/sign-in')}
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={styles.secondaryButtonText}>Zur Anmeldung</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// =============================================================================
// DESIGN DER REGISTRIERUNGSSEITE
// Die Gruppen entsprechen der Loginseite, damit beide Seiten gleich aussehen.
// =============================================================================
const styles = StyleSheet.create({
  // --- Seitenhintergrund und weiße Formularkarte ---
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 30,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },

  // --- Überschrift und Erklärungstext ---
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 32,
    textAlign: 'center',
  },

  // --- Rote beziehungsweise grüne Rückmeldung ---
  feedback: {
    marginBottom: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  feedbackError: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  feedbackSuccess: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  feedbackIcon: {
    width: 22,
    height: 22,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  feedbackErrorText: {
    color: '#b91c1c',
  },
  feedbackSuccessText: {
    color: '#15803d',
  },

  // --- Beschriftungen und Eingabefelder ---
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1f2937',
  },

  // --- Konto-erstellen-Button und Zurück-zur-Anmeldung-Button ---
  buttonContainer: {
    marginTop: 10,
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryButtonText: {
    color: '#4b5563',
    fontSize: 16,
    fontWeight: '600',
  },
});
