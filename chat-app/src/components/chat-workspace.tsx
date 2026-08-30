// =============================================================================
// CHAT-WORKSPACE: GESAMTES LAYOUT NACH DEM LOGIN
// Links befindet sich die Chatliste mit Benutzerkonto und Logout. Rechts befindet
// sich die ausgewählte Unterhaltung mit Nachrichten und Eingabefeld.
// Auf kleinen Displays werden Chatliste und Unterhaltung nacheinander angezeigt.
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAuth } from '../auth/auth-context';
import {
  GATEWAY_WS_URL,
  getUsers,
} from '../utils/api-client';

import {
  encryptMessageForUser,
  ensureE2eeIdentity,
  type LocalE2eeIdentity,
} from '../e2ee/e2ee';

// =============================================================================
// DATENTYPEN
// Diese Typen legen fest, wie Chats und Nachrichten im Frontend aufgebaut sind.
// =============================================================================

// Daten, die pro Eintrag in der linken Chatliste benötigt werden.
type ChatPreview = {
  id: string;
  name: string;
  isOnline: boolean;
};

// Aufbau einer einzelnen Nachricht im rechten Gesprächsbereich.
type ChatMessage = {
  id: string;
  mine: boolean;
  text: string;
  time: string;
};

// =============================================================================
// HAUPTKOMPONENTE DES CHAT-WORKSPACES
// =============================================================================
export default function ChatWorkspace() {
  const { width } = useWindowDimensions();
  const {
    consumeLoginSuccess,
    getValidAccessToken,
    loginSuccessPending,
    session,
    signOut: endSession,
  } = useAuth();
  const isCompact = width < 760;

  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] =
    useState<Record<string, ChatMessage[]>>({});
  const [draft, setDraft] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showChatOnCompactScreen, setShowChatOnCompactScreen] = useState(false);
  const [showLoginNotice, setShowLoginNotice] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);

  const [
    e2eeIdentity,
    setE2eeIdentity,
  ] =
    useState<
      LocalE2eeIdentity | null
    >(null);
  
  const [
    e2eeError,
    setE2eeError,
  ] =
    useState<string | null>(null);
  
  const [
    isSendingMessage,
    setIsSendingMessage,
  ] =
    useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }
  
    // Traefik nimmt die Verbindung auf Port 80 an und leitet
    // den Pfad /ws an das Gateway weiter.
    const gatewayUrl = `${GATEWAY_WS_URL}/ws`;
  
    let socket: WebSocket | null = null;
    let retryTimer:
      | ReturnType<typeof setTimeout>
      | undefined;
    let heartbeatTimer:
      | ReturnType<typeof setInterval>
      | undefined;
    let stopped = false;
  
    function stopHeartbeat() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
    }
  
    function sendHeartbeat() {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'presence.heartbeat',
          })
        );
      }
    }
  
    function scheduleReconnect() {
      if (stopped || retryTimer) {
        return;
      }
  
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, 2000);
    }
  
    async function connect() {
      try {
        const accessToken =
          await getValidAccessToken();
  
        if (stopped || !accessToken) {
          return;
        }
  
        socket = new WebSocket(
          `${gatewayUrl}?access_token=${encodeURIComponent(
            accessToken
          )}`
        );
  
        socketRef.current = socket;
  
        socket.onopen = () => {
          console.log(
            'WebSocket mit Gateway verbunden'
          );
  
          stopHeartbeat();
          sendHeartbeat();
  
          heartbeatTimer = setInterval(
            sendHeartbeat,
            30000
          );
        };
  
        socket.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);
  
            console.log(
              'Antwort vom Gateway:',
              response
            );
          } catch {
            console.warn(
              'Ungültige WebSocket-Nachricht empfangen'
            );
          }
        };
  
        socket.onerror = () => {
          console.warn(
            'WebSocket-Verbindung fehlgeschlagen'
          );
        };
  
        socket.onclose = () => {
          stopHeartbeat();
  
          if (socketRef.current === socket) {
            socketRef.current = null;
          }
  
          console.log('WebSocket geschlossen');
          scheduleReconnect();
        };
      } catch (error) {
        console.warn(
          'WebSocket konnte nicht aufgebaut werden.',
          error
        );
  
        scheduleReconnect();
      }
    }
  
    void connect();
  
    return () => {
      stopped = true;
  
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
  
      stopHeartbeat();
      socket?.close();
  
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [
    getValidAccessToken,
    session?.accessToken,
  ]);

  useEffect(() => {
    const userId =
      session?.user.userId;
  
    if (!userId) {
      setE2eeIdentity(null);
      setE2eeError(null);
      return;
    }
  
    let cancelled = false;
  
    async function initializeE2ee() {
      try {
        const accessToken =
          await getValidAccessToken();
  
        if (!accessToken) {
          throw new Error(
            'Die Sitzung ist abgelaufen.'
          );
        }
  
        const identity =
          await ensureE2eeIdentity(
            userId!,
            accessToken
          );
  
        if (!cancelled) {
          setE2eeIdentity(identity);
          setE2eeError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setE2eeIdentity(null);
  
          setE2eeError(
            error instanceof Error
              ? error.message
              : 'E2EE konnte nicht initialisiert werden.'
          );
        }
      }
    }
  
    void initializeE2ee();
  
    return () => {
      cancelled = true;
    };
  }, [
    getValidAccessToken,
    session?.user.userId,
  ]);

  // Lädt die Nutzer über Gateway und UserService.
  // Der UserService ergänzt den Online-Status aus Redis.
  useEffect(() => {
    if (!session) {
      setChats([]);
      setSelectedChatId(null);
      setUsersError(null);
      setIsLoadingUsers(false);
      return;
    }
  
    let stopped = false;
    let requestRunning = false;
  
    setIsLoadingUsers(true);
  
    async function loadUsers() {
      if (requestRunning) {
        return;
      }
  
      requestRunning = true;
  
      try {
        const accessToken =
          await getValidAccessToken();
  
        if (stopped || !accessToken) {
          return;
        }
  
        const users = await getUsers(accessToken);
  
        if (stopped) {
          return;
        }
  
        const nextChats: ChatPreview[] =
          users.map((user) => ({
            id: user.userId,
            name: user.displayName,
            isOnline: user.isOnline,
          }));
  
        setChats(nextChats);
        setUsersError(null);
  
        setSelectedChatId((current) =>
          current &&
          nextChats.some(
            (chat) => chat.id === current
          )
            ? current
            : nextChats[0]?.id ?? null
        );
  
        setMessagesByChat((current) => {
          const next = { ...current };
  
          for (const chat of nextChats) {
            next[chat.id] ??= [];
          }
  
          return next;
        });
      } catch (error) {
        if (!stopped) {
          setUsersError(
            error instanceof Error
              ? error.message
              : 'Nutzer konnten nicht geladen werden.'
          );
        }
      } finally {
        requestRunning = false;
  
        if (!stopped) {
          setIsLoadingUsers(false);
        }
      }
    }
  
    void loadUsers();
  
    const refreshTimer = setInterval(() => {
      void loadUsers();
    }, 30000);
  
    return () => {
      stopped = true;
      clearInterval(refreshTimer);
    };
  }, [
    getValidAccessToken,
    session?.accessToken,
  ]);
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

  // Sucht aus der echten Nutzerliste den aktuell ausgewählten Chat.
  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId),
    [chats, selectedChatId]
  );

  // =============================================================================
  // BEDIENFUNKTIONEN
  // =============================================================================

  function selectChat(chatId: string) {
    setSelectedChatId(chatId);
    setShowChatOnCompactScreen(true);
  }

  async function sendMessage() {
    const plaintext = draft.trim();
    const socket = socketRef.current;
  
    if (
      !plaintext ||
      !selectedChatId
    ) {
      return;
    }
  
    if (!e2eeIdentity) {
      Alert.alert(
        'E2EE nicht bereit',
        e2eeError ??
          'Der lokale Schlüssel wird noch vorbereitet.'
      );
  
      return;
    }
  
    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
    ) {
      Alert.alert(
        'Keine Verbindung',
        'Der Gateway ist momentan nicht verbunden.'
      );
  
      return;
    }
  
    setIsSendingMessage(true);
  
    try {
      const accessToken =
        await getValidAccessToken();
  
      if (!accessToken) {
        throw new Error(
          'Die Sitzung ist abgelaufen.'
        );
      }
  
      const ciphertext =
        await encryptMessageForUser(
          e2eeIdentity,
          selectedChatId,
          plaintext,
          accessToken
        );
  
      socket.send(
        JSON.stringify({
          targetId: selectedChatId,
  
          // Im Feld text steht nur noch
          // der verschlüsselte Container.
          text: ciphertext,
        })
      );
  
      // Der eigene Klartext wird nur
      // lokal für die Oberfläche genutzt.
      setMessagesByChat(
        (current) => ({
          ...current,
          [selectedChatId]: [
            ...(current[
              selectedChatId
            ] ?? []),
            {
              id:
                `${selectedChatId}-${Date.now()}`,
              mine: true,
              text: plaintext,
              time: 'Jetzt',
            },
          ],
        })
      );
  
      setDraft('');
    } catch (error) {
      Alert.alert(
        'Nachricht nicht gesendet',
        error instanceof Error
          ? error.message
          : 'Die Verschlüsselung ist fehlgeschlagen.'
      );
    } finally {
      setIsSendingMessage(false);
    }
  }

  // Meldet den Nutzer über Gateway und UserService ab.
  // Anschließend löscht der Auth-Context die lokal gespeicherte Session.
  // Das Root-Layout leitet danach automatisch zur Loginseite.
  async function signOut() {
    setIsSigningOut(true);
  
    try {
      await endSession();
    } catch (error) {
      Alert.alert(
        'Fehler beim Logout',
        error instanceof Error
          ? error.message
          : 'Die Abmeldung ist fehlgeschlagen.'
      );
  
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

            {/* CHATLISTE: Nutzer aus dem UserService mit Redis-Online-Status. */}
            <ScrollView
              contentContainerStyle={styles.chatList}
              showsVerticalScrollIndicator={false}
              style={styles.chatListScroller}
            >
              <Text style={styles.sectionLabel}>NACHRICHTEN</Text>
              {isLoadingUsers && (
                <ActivityIndicator color="#8b5cf6" style={styles.userListNotice} />
              )}
              {!isLoadingUsers && usersError && (
                <Text style={styles.userListNotice}>{usersError}</Text>
              )}
              {!isLoadingUsers && !usersError && chats.length === 0 && (
                <Text style={styles.userListNotice}>Noch keine anderen Nutzer gefunden.</Text>
              )}
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
                      {chat.isOnline && <View style={styles.onlineDotSmall} />}
                    </View>
                    <View style={styles.chatRowText}>
                      <View style={styles.chatRowTitleLine}>
                        <Text style={styles.chatName}>{chat.name}</Text>
                      </View>
                      <Text numberOfLines={1} style={styles.chatPreview}>
                        {chat.isOnline ? 'Online' : 'Offline'}
                      </Text>
                    </View>
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
        {showConversation && selectedChat && (
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
                {selectedChat.isOnline && <View style={styles.onlineDotSmall} />}
              </View>
              <View style={styles.conversationTitleBlock}>
                <Text style={styles.conversationTitle}>{selectedChat.name}</Text>
                <View style={styles.statusLine}>
                  <View
                    style={[
                      styles.statusDot,
                      !selectedChat.isOnline && styles.statusDotOffline,
                    ]}
                  />
                  <Text style={styles.conversationStatus}>
                    {selectedChat.isOnline ? 'Online' : 'Offline'}
                  </Text>
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
              {(messagesByChat[selectedChat.id] ?? []).map((message) => (
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
                  disabled={
                    !draft.trim() ||
                    !e2eeIdentity ||
                    isSendingMessage
                  }
                  onPress={() =>
                    void sendMessage()
                  }
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
              {e2eeError
                ? `E2EE-Fehler: ${e2eeError}`
                : e2eeIdentity
                  ? 'Nachrichten werden vor dem Senden lokal verschlüsselt.'
                  : 'E2EE-Schlüssel wird vorbereitet …'}
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
  userListNotice: {
    marginVertical: 14,
    paddingHorizontal: 9,
    color: '#94a3b8',
    fontSize: 13,
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
  chatPreview: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 13,
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
