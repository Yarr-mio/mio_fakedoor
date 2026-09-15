import { describe, expect, it } from 'vitest';
import { CONVERSATION_SCENARIOS, nextScenarioTurn, completedScenarioTurns } from './conversation-scenarios';
import { summaryCases, summaryOf, type DemoMessage } from './need-flow';

describe('authored scenario boundaries', () => {
  it('provides unique identifiers, complete pairs and explicit response rationale', () => {
    const turns = CONVERSATION_SCENARIOS.flatMap(item=>item.turns);
    expect(CONVERSATION_SCENARIOS).toHaveLength(8);
    expect(turns).toHaveLength(32);
    expect(new Set(turns.map(item=>item.id)).size).toBe(turns.length);
    expect(new Set(turns.map(item=>item.user)).size).toBe(turns.length);
    for (const turn of turns) for (const value of [turn.user,turn.reply,turn.principle,turn.avoid,...Object.values(turn.summary)]) expect(value.trim().length).toBeGreaterThan(0);
  });
  it('does not advance on a sent message, generic response, failure or partial stream', () => {
    const scenario=CONVERSATION_SCENARIOS[0], first=scenario.turns[0];
    const messages:DemoMessage[]=[{role:'user',text:first.user,source:'fixture',fixtureId:first.id},{role:'mio',text:'GENERIC',source:'mock'}];
    expect(nextScenarioTurn(scenario.id,messages)?.id).toBe(first.id);
    expect(completedScenarioTurns(scenario.id,messages)).toBe(0);
    messages.push({role:'mio',text:first.reply,source:'mock',fixtureId:first.id});
    expect(nextScenarioTurn(scenario.id,messages)?.id).toBe(scenario.turns[1].id);
    expect(completedScenarioTurns(scenario.id,messages)).toBe(1);
  });
  it('uses only the latest contiguous fixture summary without importing future emotions', () => {
    const scenario=CONVERSATION_SCENARIOS.find(item=>item.id==='correct_me')!;
    const messages:DemoMessage[]=[{role:'user',source:'fixture',fixtureId:scenario.turns[0].id,text:scenario.turns[0].user}];
    expect(summaryOf(messages)).not.toContain('억울');
    messages.push({role:'user',source:'typed',fixtureId:scenario.turns[1].id,text:scenario.turns[1].user});
    expect(summaryCases(messages)[0].summary).toEqual(scenario.turns[0].summary);
    messages.push(...scenario.turns.slice(1,3).map(turn=>({role:'user' as const,source:'fixture' as const,fixtureId:turn.id,text:turn.user})));
    expect(summaryCases(messages)).toHaveLength(1);
    expect(summaryCases(messages)[0].summary.feeling).toContain('억울하고 화가');
  });
  it('preserves no-help, negative and existing-alternative endings without benefit claims', () => {
    for (const id of ['not_helping','too_much','existing_method']) {
      const scenario=CONVERSATION_SCENARIOS.find(item=>item.id===id)!;
      const messages=scenario.turns.map(turn=>({role:'user' as const,source:'fixture' as const,fixtureId:turn.id,text:turn.user}));
      expect(summaryCases(messages)[0].summary).toEqual(scenario.turns[3].summary);
    }
  });
});
