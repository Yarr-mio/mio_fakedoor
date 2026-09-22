import { TONE_EXAMPLES } from './chat-mock';
import { CONVERSATION_SCENARIOS } from './conversation-scenarios';
import type { DemoMessage } from './need-flow';

export type MockFollowUp = 'offer' | 'wait' | 'pause' | 'end';
// Public fixture metadata only. This does not classify free text or detect risk.
export function mockFollowUp(messages: DemoMessage[]): MockFollowUp {
  const lastUser = [...messages].reverse().find(message => message.role === 'user');
  if (!lastUser || lastUser.source !== 'fixture') return 'offer';
  const scenarioTurn = CONVERSATION_SCENARIOS.flatMap(item => item.turns).find(turn => turn.id === lastUser.fixtureId && turn.user === lastUser.text);
  const single = TONE_EXAMPLES.find(turn => turn.user === lastUser.text);
  const value = scenarioTurn?.followUp ?? single?.followUp;
  return value === 'wait' || value === 'pause' || value === 'end' ? value : 'offer';
}
