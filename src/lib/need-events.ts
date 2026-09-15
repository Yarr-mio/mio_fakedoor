// Local-only v5 adapter. No network transport, free text, contacts or chat content.
export const NEED_EVENT_KEY = 'mio_need_flow_events_v5_2';
export const EVENT_NAMES = ['landing_viewed', 'entry_clicked', 'notice_acknowledged', 'need_selected', 'demo_started', 'demo_option_selected', 'direction_changed', 'summary_opened', 'summary_edited', 'summary_downloaded', 'support_opened', 'support_link_clicked', 'finish_opened', 'feedback_submitted', 'feedback_skipped', 'prototype_finished', 'interest_opened', 'mock_fixture_sent', 'mock_input_sent', 'mock_response_started', 'mock_response_completed', 'mock_response_stopped', 'mock_response_failed', 'mock_response_retried', 'followup_choice', 'interview_interest_selected', 'interview_contact_opened', 'scenario_selected', 'conversation_ended_quietly'] as const;
export type NeedEventName = typeof EVENT_NAMES[number];
export type NeedEvent = {
  id: string; journeyId: string; at: string; version: 'need-flow-v5.2'; mode: 'scripted_demo'; internal: boolean;
  name: NeedEventName;
  props: Partial<{ screen: string; need: string; option: number; turn: number; resource: string; rating: string }>;
};
let journeyId = '';
const allowedProps = new Set(['screen', 'need', 'option', 'turn', 'resource', 'rating']);
export function readNeedEvents(): NeedEvent[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(NEED_EVENT_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((event): event is NeedEvent => event?.version === 'need-flow-v5.2' && event?.mode === 'scripted_demo' && EVENT_NAMES.includes(event.name) && typeof event.journeyId === 'string' && typeof event.id === 'string' && typeof event.internal === 'boolean' && typeof event.props === 'object' && event.props !== null);
  } catch { return []; }
}
export function trackNeed(name: NeedEventName, props: NeedEvent['props'] = {}): void {
  if (typeof window === 'undefined') return;
  try {
    journeyId ||= crypto.randomUUID();
    const safeProps = Object.fromEntries(Object.entries(props).filter(([key, value]) => allowedProps.has(key) && (typeof value === 'number' || typeof value === 'string')));
    const event: NeedEvent = { id: crypto.randomUUID(), journeyId, at: new Date().toISOString(), version: 'need-flow-v5.2', mode: 'scripted_demo', internal: new URLSearchParams(window.location.search).get('internal') === '1', name, props: safeProps };
    localStorage.setItem(NEED_EVENT_KEY, JSON.stringify([...readNeedEvents(), event].slice(-2000)));
  } catch { /* Storage failure must not block the prototype. */ }
}
export function clearNeedEvents(): void {
  try { localStorage.removeItem(NEED_EVENT_KEY); } catch { /* UI can continue. */ }
  journeyId = '';
}
export function needMetrics(events: NeedEvent[]) {
  const journeys = (name: NeedEventName) => new Set(events.filter(event => event.name === name).map(event => event.journeyId));
  const exposed = journeys('landing_viewed');
  const started = new Set([...journeys('entry_clicked')].filter(id => exposed.has(id)));
  return { exposed: exposed.size, started: started.size, startRate: exposed.size ? started.size / exposed.size : null, demoJourneys: journeys('demo_started').size, supportJourneys: journeys('support_opened').size, interestJourneys: journeys('interest_opened').size };
}
