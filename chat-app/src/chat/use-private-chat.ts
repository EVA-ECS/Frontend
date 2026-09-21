import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decryptMessageForCurrentUser, encryptMessageForUser, ensureE2eeIdentity, type LocalE2eeIdentity } from '../e2ee/e2ee';
import { GATEWAY_WS_URL, getChatHistory, type ChatEvent } from '../utils/api-client';
import { isChatEvent, mergeMessages, messageTime, validateParticipants, type ChatMessage } from './messages';

type Notice = (title: string, message: string, kind?: 'success' | 'error') => void;
type HistoryState = { loading: boolean; error: string | null; nextCursor?: string | null };

export function usePrivateChat(userId: string | undefined, selectedChatId: string | null,
  getToken: () => Promise<string | null>, notify: Notice, visibleChatId: string | null = selectedChatId) {
  const [messagesByChat, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [history, setHistory] = useState<Record<string, HistoryState>>({});
  const [identity, setIdentity] = useState<LocalE2eeIdentity | null>(null);
  const [e2eeError, setE2eeError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [isSendingMessage, setSending] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const generation = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const visibleChatIdRef = useRef<string | null>(visibleChatId);
  const unreadByChat = useMemo(() => Object.fromEntries(
    Object.entries(messagesByChat).map(([chatId, messages]) =>
      [chatId, messages.filter(message => !message.mine && message.unread).length])
  ), [messagesByChat]);

  useEffect(() => {
    visibleChatIdRef.current = visibleChatId;
    if (!visibleChatId) return;
    setMessages(current => {
      const messages = current[visibleChatId];
      if (!messages?.some(message => message.unread)) return current;
      return { ...current, [visibleChatId]: messages.map(message =>
        message.unread ? { ...message, unread: false } : message) };
    });
  }, [visibleChatId]);

  const insert = useCallback((chatId: string, messages: ChatMessage[]) => {
    setMessages(current => ({ ...current, [chatId]: mergeMessages(current[chatId] ?? [], messages) }));
  }, []);

  const decode = useCallback(async (event: ChatEvent, key: LocalE2eeIdentity, token: string): Promise<ChatMessage> => {
    validateParticipants(event, key.userId);
    let text: string;
    try { text = await decryptMessageForCurrentUser(key, event.ciphertext, token); }
    catch { text = 'Nachricht nicht lesbar: Schlüssel fehlt oder Inhalt wurde verändert.'; }
    return { id: event.messageId, mine: event.senderId === key.userId, text,
      ciphertext: event.ciphertext, timestamp: event.timestamp, time: messageTime(event.timestamp), status: 'stored', unread: false };
  }, []);

  useEffect(() => {
    generation.current += 1;
    setMessages({});
    setHistory({});
    setIdentity(null);
    setE2eeError(null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let socket: WebSocket | null = null;
    let processing = Promise.resolve();
    let activeIdentity: LocalE2eeIdentity | null = null;
    const markUnconfirmed = (requestId?: string) => setMessages(current => Object.fromEntries(
      Object.entries(current).map(([id, messages]) => [id, messages.map(message =>
        message.status === 'sending' && (!requestId || message.requestId === requestId)
          ? { ...message, status: 'unconfirmed' as const } : message)])));

    async function handle(value: unknown) {
      if (stopped || !activeIdentity) return;
      if (isChatEvent(value)) {
        const token = await getToken();
        if (!token || stopped) return;
        const message = await decode(value, activeIdentity, token);
        if (!stopped) {
          const chatId = message.mine ? value.targetId : value.senderId;
          insert(chatId, [{ ...message, unread: !message.mine && visibleChatIdRef.current !== chatId }]);
        }
        return;
      }
      const reply = value as { status?: string; requestId?: string; messageId?: string; timestamp?: string; message?: string };
      if (!reply?.requestId) return;
      const timer = timers.current.get(reply.requestId);
      if (timer) clearTimeout(timer);
      timers.current.delete(reply.requestId);
      if (reply.status === 'published' && reply.messageId && reply.timestamp) {
        setMessages(current => Object.fromEntries(Object.entries(current).map(([id, messages]) => {
          const pending = messages.find(message => message.requestId === reply.requestId);
          return [id, pending ? mergeMessages(messages.filter(message => message.id !== pending.id), [{
            ...pending, id: reply.messageId!, timestamp: reply.timestamp!, time: messageTime(reply.timestamp!), status: 'published',
          }]) : messages];
        })));
      } else if (reply.status === 'error') {
        markUnconfirmed(reply.requestId);
        notify('Versand nicht bestätigt', reply.message ?? 'Bitte die Verbindung prüfen.');
      }
    }

    async function connect() {
      try {
        const token = await getToken();
        if (!token || stopped) return;
        socket = new WebSocket(`${GATEWAY_WS_URL}/ws?access_token=${encodeURIComponent(token)}`);
        socketRef.current = socket;
        socket.onopen = () => {
          if (stopped) return;
          setConnectionError(null);
          setConnectionVersion(value => value + 1);
          const sendHeartbeat = () => {
            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'presence.heartbeat' }));
          };
          sendHeartbeat();
          heartbeat = setInterval(sendHeartbeat, 30000);
        };
        socket.onmessage = event => {
          // Serial processing preserves order while decrypting; no per-message background task fan-out.
          processing = processing.then(() => handle(JSON.parse(event.data))).catch(() => {
            if (!stopped) notify('Nachricht nicht lesbar', 'Die Nachricht konnte nicht sicher zugeordnet werden.');
          });
        };
        socket.onerror = () => { if (!stopped) setConnectionError('Chatserver nicht erreichbar. Verbindung wird erneut versucht.'); };
        socket.onclose = event => {
          if (heartbeat) clearInterval(heartbeat);
          if (socketRef.current === socket) socketRef.current = null;
          if (stopped) return;
          markUnconfirmed();
          if (event.code === 4001) {
            stopped = true;
            setConnectionError('Dieses Fenster wurde durch eine andere Anmeldung ersetzt. Hier wird nicht automatisch neu verbunden.');
            return;
          }
          setConnectionError('Verbindung unterbrochen. Nicht bestätigte Nachrichten werden nicht automatisch erneut gesendet.');
          retry = setTimeout(() => { void connect(); }, 2000);
        };
      } catch {
        if (!stopped) {
          setConnectionError('Chatserver nicht erreichbar. Verbindung wird erneut versucht.');
          retry = setTimeout(() => { void connect(); }, 2000);
        }
      }
    }

    void (async () => {
      try {
        const token = await getToken();
        if (!token || stopped) return;
        activeIdentity = await ensureE2eeIdentity(userId, token);
        if (stopped) return;
        setIdentity(activeIdentity);
        setE2eeError(null);
        await connect();
      } catch (error) {
        if (!stopped) {
          setIdentity(null);
          setE2eeError(error instanceof Error ? error.message : 'Verschlüsselung nicht verfügbar.');
        }
      }
    })();
    const activeTimers = timers.current;
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (heartbeat) clearInterval(heartbeat);
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [userId, getToken, notify, decode, insert]);

  const loadHistory = useCallback(async (chatId: string, before?: string) => {
    if (!identity || !userId) return;
    const started = generation.current;
    setHistory(current => ({ ...current, [chatId]: { ...current[chatId], loading: true, error: null } }));
    try {
      const token = await getToken();
      if (!token) throw new Error('Die Sitzung ist abgelaufen.');
      const page = await getChatHistory(token, chatId, before);
      const messages: ChatMessage[] = [];
      for (const event of page.messages) {
        if (!isChatEvent(event) || (event.senderId !== chatId && event.targetId !== chatId))
          throw new Error('Ungültige Antwort beim Laden des Verlaufs.');
        messages.push(await decode(event, identity, token));
      }
      if (generation.current !== started) return;
      insert(chatId, messages);
      setHistory(current => ({ ...current, [chatId]: { loading: false, error: null, nextCursor: page.nextCursor } }));
    } catch (error) {
      if (generation.current === started) setHistory(current => ({ ...current, [chatId]: {
        ...current[chatId], loading: false, error: error instanceof Error ? error.message : 'Verlauf nicht verfügbar.',
      } }));
    }
  }, [identity, userId, getToken, decode, insert]);

  useEffect(() => { if (selectedChatId) void loadHistory(selectedChatId); }, [selectedChatId, connectionVersion, loadHistory]);

  const sendMessage = useCallback(async (targetId: string, plaintext: string): Promise<boolean> => {
    const socket = socketRef.current;
    if (!identity || !socket || socket.readyState !== WebSocket.OPEN) {
      notify('Nicht verbunden', e2eeError ?? connectionError ?? 'Die Verbindung oder Verschlüsselung ist noch nicht bereit.');
      return false;
    }
    if (!plaintext.trim() || plaintext.length > 4000) return false;
    setSending(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Die Sitzung ist abgelaufen.');
      const ciphertext = await encryptMessageForUser(identity, targetId, plaintext, token);
      const requestId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      socket.send(JSON.stringify({ type: 'chat.message.send', requestId, targetId, text: ciphertext }));
      insert(targetId, [{ id: `pending:${requestId}`, requestId, mine: true, text: plaintext,
        ciphertext, timestamp, time: messageTime(timestamp), status: 'sending' }]);
      timers.current.set(requestId, setTimeout(() => {
        timers.current.delete(requestId);
        setMessages(current => ({ ...current, [targetId]: (current[targetId] ?? []).map(message =>
          message.requestId === requestId && message.status === 'sending' ? { ...message, status: 'unconfirmed' } : message) }));
      }, 15000));
      return true;
    } catch (error) {
      notify('Nachricht nicht gesendet', error instanceof Error ? error.message : 'Verschlüsselung oder Versand fehlgeschlagen.');
      return false;
    } finally { setSending(false); }
  }, [identity, e2eeError, connectionError, getToken, notify, insert]);

  return { messagesByChat, unreadByChat, history, loadHistory, sendMessage, isSendingMessage, e2eeError, connectionError, e2eeReady: !!identity };
}
