import { describe, expect, it } from 'vitest';
import { mockReplyFor, TONE_EXAMPLES } from './chat-mock';
import { summaryOf, summaryCases } from './need-flow';

describe('mock conversation boundaries', () => {
  it('only uses the matched canned reply for an exact fixture, never extracts meaning from arbitrary input', () => {
    for (const example of TONE_EXAMPLES) expect(mockReplyFor(example.user, 'listen')).toBe(example.reply);
    expect(mockReplyFor('PRIVATE_UNRELATED_TEXT', 'listen')).toBe(mockReplyFor('완전히 다른 문장', 'listen'));
    expect(mockReplyFor('무엇이든', 'organize')).not.toBe(mockReplyFor('무엇이든', 'listen'));
  });
  it('excludes typed text and model replies from summary and download content', () => {
    const summary = summaryOf([{ role: 'user', text: 'PUBLIC_FIXTURE', source: 'fixture' }, { role: 'user', text: 'PRIVATE_TYPED_TEXT', source: 'typed' }, { role: 'mio', text: 'MOCK_REPLY', source: 'mock' }]);
    expect(summary).not.toContain('PRIVATE_TYPED_TEXT');
    expect(summary).not.toContain('MOCK_REPLY');
    expect(summary).not.toContain('PUBLIC_FIXTURE');
    expect(summaryOf([{ role: 'user', text: 'PRIVATE_ONLY', source: 'typed' }])).toContain('대화 예시');
  });
  it('keeps unrelated authored cases separate and ignores typed lookalikes', () => {
    const cases = summaryCases([{role:'user',text:TONE_EXAMPLES[1].user,source:'fixture'},{role:'user',text:TONE_EXAMPLES[2].user,source:'fixture'},{role:'user',text:TONE_EXAMPLES[3].user,source:'typed'}]);
    expect(cases.map(item=>item.id)).toEqual(['organize','uncertain']);
    expect(cases[1].summary.concern).toContain('알 수 없어요');
    expect(summaryOf(cases.map(item=>({role:'user',text:item.user,source:'fixture'})))).not.toContain('화가');
  });
});
