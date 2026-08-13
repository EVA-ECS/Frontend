// =============================================================================
// CHAT-WORKSPACE: GESAMTES LAYOUT NACH DEM LOGIN
// Links befindet sich die Chatliste mit Benutzerkonto und Logout. Rechts befindet
// sich die ausgewählte Unterhaltung mit Nachrichten und Eingabefeld.
// Auf kleinen Displays werden Chatliste und Unterhaltung nacheinander angezeigt.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAuth } from '../auth/auth-context';
import { supabase } from '../utils/supabase';

// =============================================================================
// DATENTYPEN
// Diese Typen legen fest, wie Chats und Nachrichten im Frontend aufgebaut sind.
// =============================================================================

// Aktuell erlaubte IDs der beiden lokalen Beispiel-Chats.
type ChatId = 'robin' | 'niklas';

// Daten, die pro Eintrag in der linken Chatliste benötigt werden.
type ChatPreview = {
  id: ChatId;
  name: string;
  preview: string;
  status: string;
  unread?: number;
};

// Aufbau einer einzelnen Nachricht im rechten Gesprächsbereich.
type ChatMessage = {
  id: string;
  mine: boolean;
  text: string;
  time: string;
};

// =============================================================================
// LOKALE BEISPIELDATEN
// Diese Daten kommen noch nicht aus einer Datenbank. Sie dienen nur dazu, das
// Layout und die Bedienung sichtbar zu machen.
// =============================================================================

// Vorschauinformationen für die linke Chatliste.
const chats: ChatPreview[] = [
  {
    id: 'robin',
    name: 'Robin',
    preview: 'Hey, wie läuft das Projekt?',
    status: 'Online',
    unread: 2,
  },
  {
    id: 'niklas',
    name: 'Niklas',
    preview: 'Bis später 👋',
    status: 'Vor 12 Min. aktiv',
  },
];

// Startnachrichten, getrennt nach Chat-ID.
const initialMessages: Record<ChatId, ChatMessage[]> = {
  robin: [
    { id: 'r-1', mine: false, text: 'Hey 👋', time: '17:31' },
    { id: 'r-2', mine: false, text: 'Wie läuft das Projekt?', time: '17:32' },
    { id: 'r-3', mine: true, text: 'Eigentlich richtig gut 😄', time: '17:34' },
  ],
  niklas: [
    { id: 'n-1', mine: false, text: 'Hast du morgen kurz Zeit?', time: '16:08' },
    { id: 'n-2', mine: true, text: 'Ja, lass uns um 10 Uhr sprechen.', time: '16:11' },
    { id: 'n-3', mine: false, text: 'Perfekt, bis später 👋', time: '16:12' },
  ],
};

// =============================================================================
// HAUPTKOMPONENTE DES CHAT-WORKSPACES
// =============================================================================
export default function ChatWorkspace() {
  // --- Fenstergröße und zentraler Auth-Status ---
  const { width } = useWindowDimensions();
  const { consumeLoginSuccess, loginSuccessPending, session } = useAuth();

  // Unter 760 Pixeln wird das mobile/kompakte Layout verwendet.
  const isCompact = width < 760;

  // --- Inhalt des Chats ---
  // Speichert den ausgewählten Chat, alle aktuell lokalen Nachrichten und den
  // noch nicht gesendeten Text aus dem Eingabefeld.
  const [selectedChatId, setSelectedChatId] = useState<ChatId>('robin');
  const [messagesByChat, setMessagesByChat] =
    useState<Record<ChatId, ChatMessage[]>>(initialMessages);
  const [draft, setDraft] = useState('');

  // --- UI-Zustände ---
  // Logout-Ladespinner, mobile Seitenumschaltung und einmaliger Login-Toast.
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showChatOnCompactScreen, setShowChatOnCompactScreen] = useState(false);
  const [showLoginNotice, setShowLoginNotice] = useState(false);

  // =============================================================================
  // EINMALIGE ERFOLGSMELDUNG
  // Nur ein echter Login setzt loginSuccessPending auf true. Der Workspace zeigt
  // den Toast und konsumiert das Ereignis sofort, damit Fast Refresh ihn nicht
  // erneut auslösen kann.
  // =============================================================================
  useEffect(() => {
    if (!loginSuccessPending) return;

    setShowLoginNotice(true);
    consumeLoginSuccess();
  }, [consumeLoginSuccess, loginSuccessPending]);

  // Sobald der Toast sichtbar ist, wird er nach fünf Sekunden ausgeblendet.
  useEffect(() => {
    if (!showLoginNotice) return;

    const timeout = setTimeout(() => setShowLoginNotice(false), 5000);
    return () => clearTimeout(timeout);
  }, [showLoginNotice]);

  // Sucht aus der Chatliste das vollständige Objekt des ausgewählten Chats.
  // chats[0] ist ein sicherer Fallback, falls eine ID einmal nicht gefunden wird.
  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? chats[0],
    [selectedChatId]
  );

  // =============================================================================
  // BEDIENFUNKTIONEN
  // =============================================================================

  // Wählt links einen Chat aus. Auf kleinen Displays öffnet sich danach die
  // Unterhaltung bildschirmfüllend.
  function selectChat(chatId: ChatId) {
    setSelectedChatId(chatId);
    setShowChatOnCompactScreen(true);
  }

  // Fügt die eingegebene Nachricht nur lokal zum ausgewählten Chat hinzu.
  // Hier kann später utils/gateway.ts für echte Backend-Nachrichten genutzt werden.
  function sendMessage() {
    // Nur Leerzeichen gelten nicht als Nachricht.
    const text = draft.trim();
    if (!text) return;

    setMessagesByChat((current) => ({
      ...current,
      [selectedChatId]: [
        ...current[selectedChatId],
        {
          id: `${selectedChatId}-${Date.now()}`,
          mine: true,
          text,
          time: 'Jetzt',
        },
      ],
    }));
    setDraft('');
  }

  // Beendet die lokale Supabase-Session. Das Root-Layout erkennt session = null
  // und leitet automatisch zurück zur Loginseite.
  async function signOut() {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      Alert.alert('Fehler beim Logout', error.message);
      setIsSigningOut(false);
    }
  }

  // =============================================================================
  // RESPONSIVE SICHTBARKEIT
  // Desktop zeigt beide Spalten. Mobil ist entweder Liste oder Gespräch sichtbar.
  // =============================================================================
  const showSidebar = !isCompact || !showChatOnCompactScreen;
  const showConversation = !isCompact || showChatOnCompactScreen;

  return (
    <View style={[styles.page, isCompact && styles.pageCompact]}>
      {/* =====================================================================
          LOGIN-TOAST: Erscheint genau einmal nach erfolgreicher Anmeldung.
          ===================================================================== */}
      {showLoginNotice && (
        <View pointerEvents="none" style={styles.loginToast}>
          <View style={styles.loginToastIcon}>
            <Text style={styles.loginToastIconText}>✓</Text>
          </View>
          <View>
            <Text style={styles.loginToastTitle}>Anmeldung erfolgreich</Text>
            <Text style={styles.loginToastText}>Willkommen zurück im EVA Chat.</Text>
          </View>
        </View>
      )}

      {/* =====================================================================
          APP-RAHMEN: Enthält linke Seitenleiste und rechten Gesprächsbereich.
          ===================================================================== */}
      <View style={[styles.appShell, isCompact && styles.appShellCompact]}>
        {/* LINKE SPALTE: Logo, Chatliste sowie Konto mit Logout. */}
        {showSidebar && (
          <View style={[styles.sidebar, isCompact && styles.sidebarCompact]}>
            {/* KOPF DER SEITENLEISTE: App-Name und Platzhalter für neuen Chat. */}
            <View style={styles.brandHeader}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>E</Text>
              </View>
              <View>
                <Text style={styles.brandTitle}>EVA Chat</Text>
                <Text style={styles.brandSubtitle}>Deine Unterhaltungen</Text>
              </View>
              <Pressable accessibilityLabel="Neuen Chat starten" style={styles.newChatButton}>
                <Text style={styles.newChatButtonText}>＋</Text>
              </Pressable>
            </View>

            {/* CHATLISTE: Alle lokalen Beispiel-Unterhaltungen. */}
            <ScrollView
              contentContainerStyle={styles.chatList}
              showsVerticalScrollIndicator={false}
              style={styles.chatListScroller}
            >
              <Text style={styles.sectionLabel}>NACHRICHTEN</Text>
              {chats.map((chat) => {
                // Markiert den aktuell ausgewählten Eintrag farblich.
                const isActive = chat.id === selectedChatId;

                return (
                  <Pressable
                    accessibilityLabel={`Chat mit ${chat.name}`}
                    key={chat.id}
                    onPress={() => selectChat(chat.id)}
                    style={({ pressed }) => [
                      styles.chatRow,
                      isActive && styles.chatRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{chat.name.slice(0, 1)}</Text>
                      {chat.status === 'Online' && <View style={styles.onlineDotSmall} />}
                    </View>
                    <View style={styles.chatRowText}>
                      <View style={styles.chatRowTitleLine}>
                        <Text style={styles.chatName}>{chat.name}</Text>
                        <Text style={styles.chatTime}>{chat.id === 'robin' ? '17:34' : '16:12'}</Text>
                      </View>
                      <Text numberOfLines={1} style={styles.chatPreview}>
                        {chat.preview}
                      </Text>
                    </View>
                    {!!chat.unread && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{chat.unread}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* BENUTZERKONTO: E-Mail aus der Session und Logout-Button. */}
            <View style={styles.accountCard}>
              <View style={styles.accountAvatar}>
                <Text style={styles.accountAvatarText}>
                  {(session?.user.email ?? 'U').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.accountInfo}>
                <Text numberOfLines={1} style={styles.accountEmail}>
                  {session?.user.email}
                </Text>
                <Text style={styles.accountStatus}>Angemeldet</Text>
              </View>
              <Pressable
                accessibilityLabel="Abmelden"
                disabled={isSigningOut}
                onPress={signOut}
                style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
              >
                {isSigningOut ? (
                  <ActivityIndicator color="#cbd5e1" size="small" />
                ) : (
                  <Text style={styles.logoutText}>Abmelden</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* RECHTE SPALTE: Kopfzeile, Nachrichtenverlauf und Eingabefeld. */}
        {showConversation && (
          <View style={styles.conversation}>
            {/* GESPRÄCHSKOPF: Zurück-Button mobil, Kontaktname und Status. */}
            <View style={styles.conversationHeader}>
              {isCompact && (
                <Pressable
                  accessibilityLabel="Zur Chatliste"
                  onPress={() => setShowChatOnCompactScreen(false)}
                  style={styles.backButton}
                >
                  <Text style={styles.backButtonText}>‹</Text>
                </Pressable>
              )}
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{selectedChat.name.slice(0, 1)}</Text>
                {selectedChat.status === 'Online' && <View style={styles.onlineDotSmall} />}
              </View>
              <View style={styles.conversationTitleBlock}>
                <Text style={styles.conversationTitle}>{selectedChat.name}</Text>
                <View style={styles.statusLine}>
                  <View
                    style={[
                      styles.statusDot,
                      selectedChat.status !== 'Online' && styles.statusDotOffline,
                    ]}
                  />
                  <Text style={styles.conversationStatus}>{selectedChat.status}</Text>
                </View>
              </View>
              <Pressable accessibilityLabel="Weitere Optionen" style={styles.moreButton}>
                <Text style={styles.moreButtonText}>•••</Text>
              </Pressable>
            </View>

            {/* NACHRICHTENVERLAUF: Alle Nachrichten des ausgewählten Chats. */}
            <ScrollView
              contentContainerStyle={styles.messages}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.datePill}>
                <Text style={styles.datePillText}>HEUTE</Text>
              </View>
              {messagesByChat[selectedChatId].map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.messageLine,
                    message.mine ? styles.messageLineMine : styles.messageLineTheirs,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      message.mine ? styles.messageBubbleMine : styles.messageBubbleTheirs,
                    ]}
                  >
                    <Text style={styles.messageText}>{message.text}</Text>
                    <Text style={styles.messageTime}>{message.time}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* NACHRICHTEN-EINGABE: Lokale Texteingabe und Senden-Button. */}
            <View style={styles.composerArea}>
              <View style={styles.composer}>
                <TextInput
                  accessibilityLabel="Nachricht"
                  multiline
                  onChangeText={setDraft}
                  placeholder="Nachricht schreiben …"
                  placeholderTextColor="#64748b"
                  style={styles.messageInput}
                  value={draft}
                />
                <Pressable
                  accessibilityLabel="Nachricht senden"
                  disabled={!draft.trim()}
                  onPress={sendMessage}
                  style={({ pressed }) => [
                    styles.sendButton,
                    !draft.trim() && styles.sendButtonDisabled,
                    pressed && draft.trim() && styles.sendButtonPressed,
                  ]}
                >
                  <Text style={styles.sendButtonText}>➤</Text>
                </Pressable>
              </View>
              <Text style={styles.composerHint}>
                {Platform.OS === 'web' ? 'Nachrichten werden aktuell nur lokal angezeigt.' : 'Lokal gespeichert'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// =============================================================================
// DESIGN DES KOMPLETTEN CHAT-WORKSPACES
// Die Styles sind entsprechend den sichtbaren Layout-Bereichen gruppiert.
// =============================================================================
const styles = StyleSheet.create({
  // --- Äußerer Seitenhintergrund ---
  page: {
    flex: 1,
    backgroundColor: '#070b14',
    padding: 22,
  },
  pageCompact: {
    padding: 0,
  },

  // --- Grüne Erfolgsmeldung oben rechts ---
  loginToast: {
    position: 'absolute',
    top: 38,
    right: 38,
    zIndex: 100,
    minWidth: 270,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#166534',
    borderRadius: 14,
    backgroundColor: '#052e20',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 15,
  },
  loginToastIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#16a34a',
  },
  loginToastIconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  loginToastTitle: {
    color: '#dcfce7',
    fontSize: 13,
    fontWeight: '800',
  },
  loginToastText: {
    marginTop: 3,
    color: '#86efac',
    fontSize: 11,
  },

  // --- Gemeinsamer Rahmen für Sidebar und Gespräch ---
  appShell: {
    flex: 1,
    width: '100%',
    maxWidth: 1440,
    alignSelf: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 40,
    elevation: 12,
  },
  appShellCompact: {
    borderRadius: 0,
  },

  // --- Linke Seitenleiste ---
  sidebar: {
    width: 330,
    backgroundColor: '#0b1220',
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
  },
  sidebarCompact: {
    flex: 1,
    width: '100%',
    borderRightWidth: 0,
  },

  // --- Branding und Neuer-Chat-Button oben links ---
  brandHeader: {
    minHeight: 92,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  brandMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#7c3aed',
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  brandTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  brandSubtitle: {
    marginTop: 3,
    color: '#64748b',
    fontSize: 12,
  },
  newChatButton: {
    marginLeft: 'auto',
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#182235',
  },
  newChatButtonText: {
    color: '#c4b5fd',
    fontSize: 23,
    lineHeight: 26,
  },

  // --- Scrollbare Chatliste und einzelne Chatzeilen ---
  chatList: {
    paddingHorizontal: 14,
    paddingVertical: 20,
    gap: 7,
  },
  chatListScroller: {
    flex: 1,
  },
  sectionLabel: {
    marginBottom: 8,
    paddingHorizontal: 9,
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  chatRow: {
    minHeight: 78,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
  },
  chatRowActive: {
    backgroundColor: '#182235',
  },
  pressed: {
    opacity: 0.72,
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#6d28d9',
  },
  avatarText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  onlineDotSmall: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0b1220',
    backgroundColor: '#22c55e',
  },
  chatRowText: {
    flex: 1,
    minWidth: 0,
  },
  chatRowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatName: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '700',
  },
  chatTime: {
    color: '#64748b',
    fontSize: 11,
  },
  chatPreview: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 13,
  },
  unreadBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#8b5cf6',
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // --- Angemeldetes Konto und Logout unten links ---
  accountCard: {
    minHeight: 86,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0d1626',
  },
  accountAvatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#24324a',
  },
  accountAvatarText: {
    color: '#ddd6fe',
    fontSize: 15,
    fontWeight: '800',
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
  },
  accountEmail: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  accountStatus: {
    marginTop: 3,
    color: '#64748b',
    fontSize: 11,
  },
  logoutButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#182235',
  },
  logoutText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },

  // --- Rechter Gesprächsbereich und dessen Kopfzeile ---
  conversation: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#111827',
  },
  conversationHeader: {
    minHeight: 92,
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#101827',
  },
  backButton: {
    width: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#e2e8f0',
    fontSize: 34,
    lineHeight: 36,
  },
  conversationTitleBlock: {
    flex: 1,
  },
  conversationTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  statusLine: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  statusDotOffline: {
    backgroundColor: '#64748b',
  },
  conversationStatus: {
    color: '#94a3b8',
    fontSize: 12,
  },
  moreButton: {
    width: 42,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#182235',
  },
  moreButtonText: {
    color: '#94a3b8',
    fontSize: 16,
    letterSpacing: 2,
  },

  // --- Nachrichtenverlauf und Sprechblasen ---
  messages: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 28,
    paddingVertical: 28,
    gap: 15,
  },
  datePill: {
    alignSelf: 'center',
    marginBottom: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#192235',
  },
  datePillText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  messageLine: {
    width: '100%',
  },
  messageLineMine: {
    alignItems: 'flex-end',
  },
  messageLineTheirs: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    minWidth: 105,
    paddingHorizontal: 17,
    paddingVertical: 13,
    borderRadius: 18,
  },
  messageBubbleMine: {
    borderBottomRightRadius: 5,
    backgroundColor: '#7c3aed',
  },
  messageBubbleTheirs: {
    borderBottomLeftRadius: 5,
    backgroundColor: '#202b3d',
  },
  messageText: {
    color: '#f8fafc',
    fontSize: 15,
    lineHeight: 21,
  },
  messageTime: {
    marginTop: 6,
    alignSelf: 'flex-end',
    color: '#c4b5fd',
    fontSize: 10,
  },

  // --- Eingabebereich am unteren Rand ---
  composerArea: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#101827',
  },
  composer: {
    minHeight: 56,
    paddingLeft: 18,
    paddingRight: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a3850',
    borderRadius: 18,
    backgroundColor: '#182235',
  },
  messageInput: {
    flex: 1,
    maxHeight: 112,
    paddingVertical: 14,
    color: '#f8fafc',
    fontSize: 15,
  },
  sendButton: {
    width: 43,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#7c3aed',
  },
  sendButtonDisabled: {
    backgroundColor: '#293449',
  },
  sendButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  composerHint: {
    marginTop: 8,
    color: '#475569',
    fontSize: 10,
    textAlign: 'center',
  },
});
