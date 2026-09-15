import { describe, expect, it } from 'vitest';
import { mockFollowUp } from './mock-dialogue-policy';
import { CONVERSATION_SCENARIOS } from './conversation-scenarios';
import { TONE_EXAMPLES } from './chat-mock';
import type { DemoMessage } from './need-flow';

const turnMessage = (id:string):DemoMessage => {
  const turn=CONVERSATION_SCENARIOS.flatMap(s=>s.turns).find(t=>t.id===id)!;
  return {role:'user',source:'fixture',fixtureId:id,text:turn.user};
};
describe('response and follow-up agreement', () => {
  it('waits for listening and pauses or ends on explicit authored requests', () => {
    expect(mockFollowUp([turnMessage('after_work-3')])).toBe('wait');
    expect(mockFollowUp([turnMessage('too_much-3')])).toBe('pause');
    expect(mockFollowUp([turnMessage('too_much-4')])).toBe('end');
    const stop=TONE_EXAMPLES.find(t=>t.id==='stop')!;
    expect(mockFollowUp([{role:'user',source:'fixture',text:stop.user}])).toBe('end');
  });
  it('does not classify free text, accept a mismatching ID, or let an assistant reply reopen pause', () => {
    const paused=turnMessage('too_much-3');
    expect(mockFollowUp([{...paused,source:'typed'}])).toBe('offer');
    expect(mockFollowUp([{...paused,text:'PRIVATE_OTHER_TEXT'}])).toBe('offer');
    expect(mockFollowUp([paused,{role:'mio',source:'mock',text:'ALREADY_REPLY'}])).toBe('pause');
  });
  it('does not equate dissatisfaction alone with ending and follows a new user message', () => {
    expect(mockFollowUp([turnMessage('not_helping-1')])).toBe('offer');
    expect(mockFollowUp([turnMessage('not_helping-4')])).toBe('end');
    expect(mockFollowUp([turnMessage('too_much-3'),{role:'user',source:'typed',text:'NEW_INPUT'}])).toBe('offer');
  });
  it('keeps measurement narration out of authored responses and avoids questions after pause/end', () => {
    const turns=[...CONVERSATION_SCENARIOS.flatMap(s=>s.turns),...TONE_EXAMPLES];
    for (const turn of turns) {
      expect(turn.reply).not.toMatch(/미확인|평가를 그대로|선택도 알겠|실제.{0,8}여부/);
      if (turn.followUp==='pause'||turn.followUp==='end') expect(turn.reply).not.toContain('?');
    }
  });
});
