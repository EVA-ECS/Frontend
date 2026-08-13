// app/index.tsx
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { supabase } from '../utils/supabase';
import { Session } from '@supabase/supabase-js';

export default function LoginScreen() {
  console.log('LoginScreen WIRD GELADEN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('SESSION BEIM START:', session);
      setSession(session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('AUTH EVENT:', _event);
      console.log('NEUE SESSION:', session);
      setSession(session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

 async function signInWithEmail() {
  try {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert('Fehler beim Login', error.message);
    }
  } catch (error) {
    console.error(error);
    Alert.alert('Fehler', 'Login fehlgeschlagen.');
  } finally {
    setLoading(false);
  }
}

  async function signUpWithEmail() {
  try {
    setLoading(true);

    const {
      data: { session },
      error,
    } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      Alert.alert('Fehler', error.message);
      return;
    }

    if (!session) {
      Alert.alert(
        'Erfolg',
        'Bitte prüfe deine E-Mails für den Bestätigungslink!'
      );
    }
  } catch (error) {
    console.error(error);
    Alert.alert('Fehler', 'Registrierung fehlgeschlagen.');
  } finally {
    setLoading(false);
  }
}

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Fehler', error.message);
  }

   // ANSICHT: Eingeloggt
if (session && session.user) {
  return (
    <View style={styles.chatPage}>

      {/* SIDEBAR */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.logo}>Chat</Text>
        </View>

        <TouchableOpacity style={styles.activeChat}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>R</Text>
          </View>

          <View>
            <Text style={styles.chatUser}>Robin</Text>
            <Text style={styles.lastMessage}>
              Hey, wie läuft das Projekt?
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.chatItem}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>N</Text>
          </View>

          <View>
            <Text style={styles.chatUser}>Niklas</Text>
            <Text style={styles.lastMessage}>
              Bis später 👋
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.sidebarBottom}>
          <Text style={styles.currentUser}>
            {session.user.email}
          </Text>

          <TouchableOpacity
            style={styles.logoutSmall}
            onPress={signOut}
          >
            <Text style={styles.logoutSmallText}>
              Abmelden
            </Text>
          </TouchableOpacity>
        </View>
      </View>


      {/* CHAT */}
      <View style={styles.chatArea}>

        {/* HEADER */}
        <View style={styles.chatHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>R</Text>
          </View>

          <View>
            <Text style={styles.chatHeaderName}>Robin</Text>
            <Text style={styles.onlineText}>Online</Text>
          </View>
        </View>


        {/* NACHRICHTEN */}
        <View style={styles.messages}>

          <View style={styles.receivedMessage}>
            <Text style={styles.receivedText}>
              Hey 👋
            </Text>
          </View>

          <View style={styles.receivedMessage}>
            <Text style={styles.receivedText}>
              Wie läuft das Chat-Projekt?
            </Text>
          </View>

          <View style={styles.sentMessage}>
            <Text style={styles.sentText}>
              Eigentlich ganz gut 😄
            </Text>
          </View>

          <View style={styles.sentMessage}>
            <Text style={styles.sentText}>
              Ich baue gerade das Frontend.
            </Text>
          </View>

        </View>


        {/* INPUT */}
        <View style={styles.messageInputContainer}>
          <TextInput
            style={styles.messageInput}
            placeholder="Nachricht schreiben..."
            placeholderTextColor="#9ca3af"
          />

          <TouchableOpacity style={styles.sendButton}>
            <Text style={styles.sendButtonText}>Senden</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}
  
// ANSICHT: Login-Formular
 return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Chat Login</Text>
        <Text style={styles.subtitle}>Melde dich an</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>E-Mail</Text>
          <TextInput
            style={styles.input}
            onChangeText={(text) => setEmail(text)}
            value={email}
            placeholder="mail@beispiel.de"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Passwort</Text>
          <TextInput
            style={styles.input}
            onChangeText={(text) => setPassword(text)}
            value={password}
            secureTextEntry={true}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            disabled={loading}
            onPress={signInWithEmail}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Anmelden</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            disabled={loading}
            onPress={signUpWithEmail}
          >
            <Text style={styles.secondaryButtonText}>Registrieren</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
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
  signOutButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  signOutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  //ansich der chat seite

  chatPage: {
  flex: 1,
  flexDirection: 'row',
  backgroundColor: '#f3f4f6',
},

sidebar: {
  width: 300,
  backgroundColor: '#111827',
  borderRightWidth: 1,
  borderRightColor: '#374151',
},

sidebarHeader: {
  padding: 24,
  borderBottomWidth: 1,
  borderBottomColor: '#374151',
},

logo: {
  color: '#ffffff',
  fontSize: 24,
  fontWeight: '800',
},

activeChat: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 16,
  backgroundColor: '#1f2937',
  gap: 12,
},

chatItem: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 16,
  gap: 12,
},

avatar: {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: '#4f46e5',
  alignItems: 'center',
  justifyContent: 'center',
},

avatarText: {
  color: '#ffffff',
  fontWeight: '700',
  fontSize: 16,
},

chatUser: {
  color: '#ffffff',
  fontSize: 15,
  fontWeight: '700',
},

lastMessage: {
  color: '#9ca3af',
  fontSize: 13,
  marginTop: 3,
},

sidebarBottom: {
  marginTop: 'auto',
  padding: 20,
  borderTopWidth: 1,
  borderTopColor: '#374151',
},

currentUser: {
  color: '#d1d5db',
  fontSize: 13,
  marginBottom: 12,
},

logoutSmall: {
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 8,
  backgroundColor: '#374151',
},

logoutSmallText: {
  color: '#ffffff',
  fontWeight: '600',
  textAlign: 'center',
},


/* CHAT */

chatArea: {
  flex: 1,
  backgroundColor: '#ffffff',
},

chatHeader: {
  height: 80,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 24,
  borderBottomWidth: 1,
  borderBottomColor: '#e5e7eb',
  gap: 12,
},

chatHeaderName: {
  fontSize: 16,
  fontWeight: '700',
  color: '#111827',
},

onlineText: {
  color: '#22c55e',
  fontSize: 12,
  marginTop: 2,
},

messages: {
  flex: 1,
  padding: 24,
  gap: 10,
},

receivedMessage: {
  alignSelf: 'flex-start',
  backgroundColor: '#f3f4f6',
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderRadius: 16,
  borderBottomLeftRadius: 4,
  maxWidth: '65%',
},

receivedText: {
  color: '#111827',
  fontSize: 15,
},

sentMessage: {
  alignSelf: 'flex-end',
  backgroundColor: '#4f46e5',
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderRadius: 16,
  borderBottomRightRadius: 4,
  maxWidth: '65%',
},

sentText: {
  color: '#ffffff',
  fontSize: 15,
},

messageInputContainer: {
  flexDirection: 'row',
  padding: 20,
  borderTopWidth: 1,
  borderTopColor: '#e5e7eb',
  gap: 12,
},

messageInput: {
  flex: 1,
  backgroundColor: '#f9fafb',
  borderWidth: 1,
  borderColor: '#e5e7eb',
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 15,
  color: '#111827',
},

sendButton: {
  backgroundColor: '#4f46e5',
  paddingHorizontal: 22,
  justifyContent: 'center',
  borderRadius: 12,
},

sendButtonText: {
  color: '#ffffff',
  fontWeight: '700',
},

});