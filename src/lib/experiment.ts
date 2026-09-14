// Device-local experiment adapter. Replace transport only when a backend is authorized.
export type EventName = 'counsel_exposed' | 'counselor_profile_click' | 'conversation_start' | 'first_message_sent' | 'message_sent' | '3_turn_reached' | '10_turn_reached' | 'conversation_restart' | 'feedback_submitted';
export type ExperimentEvent = { name: EventName; at: string; visitorId: string; sessionId: string; conversationId: string | null; mode: 'scripted_demo'; version: 'entry-v4'; props: Record<string, string | number>; utm: Record<string, string> };
const KEY = 'mio_counsel_events_v4';
const VISITOR = 'mio_counsel_visitor_v4';
const LAST = 'mio_counsel_last_message_v4';
let sessionId = '';
let fallbackVisitor = '';
const memoryConversations = new Map<string, number>();
export function readEvents(): ExperimentEvent[] {
  try { const data = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(data) ? data.filter(e => e?.version === 'entry-v4' && typeof e.name === 'string' && typeof e.visitorId === 'string') : []; } catch { return []; }
}
export function track(name: EventName, props: ExperimentEvent['props'] = {}, conversationId: string | null = null) {
  if (typeof window === 'undefined') return;
  try {
    sessionId ||= crypto.randomUUID();
    fallbackVisitor ||= crypto.randomUUID();
    const visitorId = localStorage.getItem(VISITOR) || fallbackVisitor;
    localStorage.setItem(VISITOR, visitorId);
    const params = new URLSearchParams(location.search);
    const utm: Record<string, string> = {};
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'internal']) { const value = params.get(key); if (value) utm[key] = value.slice(0, 128); }
    const events = readEvents();
    events.push({ name, at: new Date().toISOString(), visitorId, sessionId, conversationId, mode: 'scripted_demo', version: 'entry-v4', props, utm });
    localStorage.setItem(KEY, JSON.stringify(events.slice(-2000)));
  } catch { /* Storage failure must not block the conversation. */ }
}
export function beginConversation(character: string, preference: string): string {
  const id = crypto.randomUUID();
  memoryConversations.set(id, 0);
  track('conversation_start', { character, preference }, id);
  return id;
}
// Only call for a user-authored, nonblank message; selection buttons never invoke this.
export function recordMessage(conversationId: string, character: string, turn: number, length: number) {
  if (length <= 0 || !Number.isInteger(turn) || turn < 1 || (memoryConversations.get(conversationId) || 0) >= turn) return;
  memoryConversations.set(conversationId, turn);
  if (turn === 1) {
    track('first_message_sent', { character, source: 'typed', length }, conversationId);
    try {
      const last = JSON.parse(localStorage.getItem(LAST) || 'null');
      if (last && last.conversationId !== conversationId && typeof last.at === 'number') {
        track('conversation_restart', { character, kind: last.sessionId === sessionId ? 'same_visit' : 'later_visit', elapsed_hours: Math.max(0, (Date.now() - last.at) / 3600000), previous_conversation_id: last.conversationId }, conversationId);
      }
    } catch {}
  }
  track('message_sent', { character, turn, source: 'typed', length }, conversationId);
  if (turn === 3) track('3_turn_reached', { character }, conversationId);
  if (turn === 10) track('10_turn_reached', { character }, conversationId);
  try { localStorage.setItem(LAST, JSON.stringify({ conversationId, sessionId, at: Date.now() })); } catch {}
}
export function clearEvents() { try { for (const key of [KEY, VISITOR, LAST]) localStorage.removeItem(key); memoryConversations.clear(); } catch {} }
export function summarize(events: ExperimentEvent[]) {
  const exposed = new Set(events.filter(e => e.name === 'counsel_exposed').map(e => e.visitorId));
  const first = events.filter(e => e.name === 'first_message_sent' && exposed.has(e.visitorId));
  const writers = new Set(first.map(e => e.visitorId));
  const startedConversations = new Set(first.map(e => e.conversationId));
  const three = new Set(events.filter(e => e.name === '3_turn_reached' && startedConversations.has(e.conversationId)).map(e => e.conversationId));
  return { exposed: exposed.size, writers: writers.size, firstConversations: startedConversations.size, threeConversations: three.size, firstRate: exposed.size ? writers.size / exposed.size : null, threeRate: startedConversations.size ? three.size / startedConversations.size : null };
}
