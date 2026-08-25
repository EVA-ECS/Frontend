// =============================================================================
// LOGINSEITE
// Diese Seite sammelt E-Mail und Passwort, prüft die Daten über Supabase und
// übergibt bei Erfolg an den geschützten Chat-Bereich.
// =============================================================================

import React, { useState } from 'react';
import { router } from 'expo-router';
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

import { useAuth } from '../auth/auth-context';
import { supabase } from '../utils/supabase';

// Einheitliches Format für rote Fehler- und grüne Erfolgsmeldungen.
type Feedback = {
  message: string;
  type: 'error' | 'success';
};

export default function SignInScreen() {
  // =============================================================================
  // ZUSTÄNDE DES LOGINFORMULARS
  // =============================================================================
  // Diese Context-Funktion sorgt dafür, dass der Chat die Erfolgsmeldung nur
  // nach einem echten Login und nicht nach jedem Fast Refresh zeigt.
  const { markLoginSuccessful } = useAuth();

  // Eingabefelder, Ladezustand des Buttons und sichtbare Rückmeldung.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // =============================================================================
  // LOGIN-ABLAUF
  // =============================================================================
  async function signInWithEmail() {
    // 1. Leere Felder direkt im Frontend abfangen.
    if (!email.trim() || !password) {
      setFeedback({
        message: 'Bitte gib deine E-Mail-Adresse und dein Passwort ein.',
        type: 'error',
      });
      return;
    }

    // 2. Alte Meldung entfernen und den Button während der Anfrage sperren.
    setFeedback(null);
    setLoading(true);

    // 3. Supabase prüft E-Mail und Passwort.
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    // 4. Fehler bleiben auf der Loginseite; Erfolg aktiviert einmalig den Toast
    // im Chat. Die geschützte Route wechselt durch die neue Session automatisch.
    if (error) {
      setFeedback({
        message: 'E-Mail-Adresse oder Passwort ist falsch.',
        type: 'error',
      });
    } else {
      markLoginSuccessful();
    }

    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        {/* KOPFBEREICH: Erklärt, wofür das Formular da ist. */}
        <Text style={styles.title}>Chat Login</Text>
        <Text style={styles.subtitle}>Melde dich an, um fortzufahren</Text>

        {/* RÜCKMELDUNG: Wird nur gerendert, wenn feedback nicht null ist. */}
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

        {/* EINGABEFELD 1: Supabase-Benutzername beziehungsweise E-Mail. */}
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

        {/* EINGABEFELD 2: Das Passwort wird auf dem Bildschirm verdeckt. */}
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

        {/* AKTIONEN: Anmelden oder zur separaten Registrierungsseite wechseln. */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            disabled={loading}
            onPress={signInWithEmail}
            style={[styles.button, styles.primaryButton]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Anmelden</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            disabled={loading}
            onPress={() => router.push('/register')}
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={styles.secondaryButtonText}>Registrieren</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// =============================================================================
// DESIGN DER LOGINSEITE
// Die Styles sind nach sichtbaren UI-Bereichen gruppiert.
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

  // --- Primärer Login-Button und sekundärer Registrierungs-Button ---
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
