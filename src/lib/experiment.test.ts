import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { beginConversation, clearEvents, readEvents, recordMessage, summarize, track } from './experiment';
const values = new Map<string, string>();
beforeEach(() => {
  values.clear(); vi.stubGlobal('window', {}); vi.stubGlobal('location', { search: '?utm_source=interview&internal=1' });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
describe('v4 conversion evidence', () => {
  it('does not count profile or preference clicks as a first message', () => {
    track('counsel_exposed'); track('counselor_profile_click', { character: 'seoyeon' }); beginConversation('seoyeon', 'unsure');
    expect(readEvents().map(e => e.name)).toEqual(['counsel_exposed', 'counselor_profile_click', 'conversation_start']);
    expect(summarize(readEvents()).firstRate).toBe(0);
  });
  it('counts typed thresholds once, excludes blank sends, and never calls a backend', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const id = beginConversation('seoyeon', 'listen');
    recordMessage(id, 'seoyeon', 1, 0); expect(readEvents()).toHaveLength(1);
    for (let turn = 1; turn <= 10; turn++) { recordMessage(id, 'seoyeon', turn, 12); recordMessage(id, 'seoyeon', turn, 12); }
    for (const name of ['first_message_sent', '3_turn_reached', '10_turn_reached']) expect(readEvents().filter(e => e.name === name)).toHaveLength(1);
    expect(readEvents().filter(e => e.name === 'message_sent')).toHaveLength(10);
    expect(readEvents()[0]).toMatchObject({ mode: 'scripted_demo', utm: { utm_source: 'interview', internal: '1' } }); expect(fetch).not.toHaveBeenCalled();
  });
  it('records restart only when a distinct conversation actually receives input', () => {
    const first = beginConversation('seoyeon', 'listen'); recordMessage(first, 'seoyeon', 1, 3);
    const next = beginConversation('jiho', 'organize'); expect(readEvents().filter(e => e.name === 'conversation_restart')).toHaveLength(0);
    recordMessage(next, 'jiho', 1, 5);
    expect(readEvents().find(e => e.name === 'conversation_restart')?.props.kind).toBe('same_visit');
  });
  it('joins 3-turn conversion by conversation and first-entry conversion by exposed visitor', () => {
    track('counsel_exposed'); const a = beginConversation('seoyeon', 'listen'); recordMessage(a, 'seoyeon', 1, 3);
    const b = beginConversation('jiho', 'organize'); recordMessage(b, 'jiho', 1, 5); recordMessage(b, 'jiho', 2, 5); recordMessage(b, 'jiho', 3, 5);
    track('3_turn_reached', {}, 'unmatched');
    expect(summarize(readEvents())).toMatchObject({ exposed: 1, writers: 1, firstConversations: 2, threeConversations: 1, firstRate: 1, threeRate: 0.5 });
    expect(summarize([]).firstRate).toBeNull();
  });
  it('handles corrupt and unavailable storage without blocking the user', () => {
    values.set('mio_counsel_events_v4', '{broken'); expect(readEvents()).toEqual([]); track('counsel_exposed'); expect(readEvents()).toHaveLength(1);
    clearEvents(); expect(readEvents()).toEqual([]);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } });
    expect(() => track('counsel_exposed')).not.toThrow(); expect(() => clearEvents()).not.toThrow();
  });
});
