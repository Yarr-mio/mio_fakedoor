import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNeedEvents, NEED_EVENT_KEY, needMetrics, readNeedEvents, trackNeed, type NeedEvent } from './need-events';
import { summaryOf } from './need-flow';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('window', { location: { search: '?internal=1' } });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  clearNeedEvents();
});
afterEach(() => vi.unstubAllGlobals());

describe('need-flow evidence boundaries', () => {
  it('stores only local metadata and never transmits free text', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    trackNeed('demo_option_selected', { option: 0, turn: 1, message: 'PRIVATE_EXAMPLE', email: 'private@example.com' } as NeedEvent['props']);
    expect(JSON.stringify(readNeedEvents())).not.toContain('PRIVATE_EXAMPLE');
    expect(JSON.stringify(readNeedEvents())).not.toContain('private@example.com');
    expect(readNeedEvents()[0]).toMatchObject({ version: 'need-flow-v5.2', mode: 'scripted_demo', internal: true, props: { option: 0, turn: 1 } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not turn support navigation into a demo start or application', () => {
    trackNeed('landing_viewed'); trackNeed('support_opened', { screen: 'landing' }); trackNeed('interest_opened');
    expect(needMetrics(readNeedEvents())).toMatchObject({ exposed: 1, started: 0, demoJourneys: 0, supportJourneys: 1, interestJourneys: 1 });
    expect(readNeedEvents().map(event => event.name)).not.toContain('beta_submitted');
  });
  it('joins start rates by the same journey and leaves absent denominators unknown', () => {
    expect(needMetrics([]).startRate).toBeNull();
    trackNeed('landing_viewed'); trackNeed('entry_clicked'); trackNeed('entry_clicked');
    const events = readNeedEvents();
    events.push({ ...events[1], id: 'unmatched', journeyId: 'another-journey' });
    expect(needMetrics(events)).toMatchObject({ exposed: 1, started: 1, startRate: 1 });
    expect(needMetrics(events.filter(event => !event.internal)).startRate).toBeNull();
  });
  it('leaves v4 records untouched when v5 is cleared', () => {
    values.set('mio_counsel_events_v4', '[{"legacy":true}]');
    values.set('mio_need_flow_events_v5_1', '[{"prior":true}]');
    values.set('mio_need_flow_events_v5', '[{"previous":true}]');
    trackNeed('landing_viewed'); clearNeedEvents();
    expect(readNeedEvents()).toEqual([]);
    expect(values.get('mio_counsel_events_v4')).toBe('[{"legacy":true}]');
    expect(values.get('mio_need_flow_events_v5_1')).toBe('[{"prior":true}]');
    expect(values.get('mio_need_flow_events_v5')).toBe('[{"previous":true}]');
  });
  it('continues safely when storage is broken or unavailable', () => {
    values.set(NEED_EVENT_KEY, 'broken'); expect(readNeedEvents()).toEqual([]);
    trackNeed('landing_viewed'); expect(readNeedEvents()).toHaveLength(1);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } });
    expect(() => trackNeed('entry_clicked')).not.toThrow(); expect(() => clearNeedEvents()).not.toThrow();
    expect(needMetrics(readNeedEvents()).startRate).toBeNull();
  });
  it('leaves unexpressed feelings unknown in authored samples', () => {
    expect(summaryOf([])).toContain('구체적인 감정은 아직 말하지 않았어요.');
    expect(summaryOf([{role:'user',text:'PRIVATE',source:'typed'}])).not.toContain('PRIVATE');
  });
});
