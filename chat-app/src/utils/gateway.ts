import { supabase } from './supabase';

const GATEWAY_URL = 'http://localhost:8080';

export async function sendMessage(text: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('User ist nicht eingeloggt.');
  }

  const response = await fetch(`${GATEWAY_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Gateway antwortet mit ${response.status}`
    );
  }

  return response.json();
}