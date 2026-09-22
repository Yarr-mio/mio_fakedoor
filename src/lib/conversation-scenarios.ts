import authored from './conversation-scenarios.json';
import type { DemoMessage, Need } from './need-flow';

export type ScenarioTurn = typeof authored[number]['turns'][number];
export type ConversationScenario = Omit<typeof authored[number], 'need'> & { need: Need };
export const CONVERSATION_SCENARIOS = authored as ConversationScenario[];
export function scenarioById(id: string | null) { return CONVERSATION_SCENARIOS.find(item => item.id === id); }

// Advance only after the matching reply has completed. Stopped/failed replies
// never consume a turn; IDs are public authored fixture identifiers, not user IDs.
export function nextScenarioTurn(id: string | null, messages: DemoMessage[]) {
  const scenario = scenarioById(id);
  return scenario?.turns.find(turn => !messages.some(message => message.role === 'mio' && message.source === 'mock' && message.fixtureId === turn.id));
}

export function completedScenarioTurns(id: string | null, messages: DemoMessage[]) {
  return scenarioById(id)?.turns.filter(turn => messages.some(message => message.role === 'mio' && message.source === 'mock' && message.fixtureId === turn.id)).length ?? 0;
}
