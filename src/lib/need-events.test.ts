import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_EVENT_VERSION } from './api/events';
import { canShowLiveObservation, clearNeedEvents, currentJourneyId, flushNeedEvents, NEED_EVENT_KEY, needMetrics, readNeedEvents, setEventSurface, trackLiveObservation, trackNeed, type NeedEvent } from './need-events';
import { summaryOf } from './need-flow';

function jsonResponse(body: unknown, status = 202) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
  vi.stubGlobal('window', { location: { search: '?internal=1' } });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  clearNeedEvents();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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
  it('keeps the same journey for later consent recording', () => {
    trackNeed('landing_viewed');
    const first = readNeedEvents()[0].journeyId;
    expect(currentJourneyId()).toBe(first);
    trackNeed('entry_clicked');
    expect(readNeedEvents()[1].journeyId).toBe(first);
  });
  it('leaves unexpressed feelings unknown in authored samples', () => {
    expect(summaryOf([])).toContain('구체적인 감정은 아직 말하지 않았어요.');
    expect(summaryOf([{role:'user',text:'PRIVATE',source:'typed'}])).not.toContain('PRIVATE');
  });
  it('does not upload stored history and keeps local fallback without a base url', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    values.set(NEED_EVENT_KEY, JSON.stringify([{ id: 'old', journeyId: 'old-journey', at: '2026-01-01T00:00:00.000Z', version: 'need-flow-v5.2', mode: 'scripted_demo', internal: false, name: 'landing_viewed', props: { screen: 'landing' } }]));
    values.set('mio_need_flow_events_v5_1', '[{"prior":true}]');
    await flushNeedEvents();
    expect(fetch).not.toHaveBeenCalled();
    trackNeed('landing_viewed', { screen: 'landing' });
    await flushNeedEvents();
    expect(fetch).not.toHaveBeenCalled();
    expect(readNeedEvents().map((event) => event.id)).toContain('old');
    expect(readNeedEvents()).toHaveLength(2);
  });
  it('posts only new events with keepalive and does not wait on trackNeed', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
    vi.stubGlobal('location', { origin: 'https://app.example.test' });
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetch);
    values.set(NEED_EVENT_KEY, JSON.stringify([{ id: 'old', journeyId: 'old-journey', at: '2026-01-01T00:00:00.000Z', version: 'need-flow-v5.2', mode: 'scripted_demo', internal: false, name: 'landing_viewed', props: { screen: 'landing' } }]));
    trackNeed('entry_clicked', { screen: 'landing' });
    expect(fetch).not.toHaveBeenCalled();
    const flush = flushNeedEvents();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/events');
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(String(init.body)) as { events: NeedEvent[] };
    expect(body.events).toHaveLength(1);
    expect(body.events[0].name).toBe('entry_clicked');
    expect(body.events[0].id).toEqual(expect.any(String));
    expect(body.events[0].mode).toBe('scripted_demo');
    expect(typeof body.events[0].internal).toBe('boolean');
    resolveFetch?.(jsonResponse({
      success: true,
      data: { accepted: 1, duplicated: 0, rejected: 0, propsStripped: 0 },
      meta: { traceId: '01TRACE' },
    }));
    await flush;
  });
  it('skips mock events on the live surface', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    setEventSurface('live');
    trackNeed('mock_input_sent', { turn: 1 });
    await flushNeedEvents();
    expect(readNeedEvents()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('records live observation ratings only and hides questions on end paths', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
    vi.stubGlobal('location', { origin: 'https://app.example.test' });
    const fetch = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: { accepted: 1, duplicated: 0, rejected: 0, propsStripped: 0 },
      meta: { traceId: '01LIVE' },
    }));
    vi.stubGlobal('fetch', fetch);
    expect(canShowLiveObservation('quiet_done')).toBe(false);
    expect(canShowLiveObservation('chat', 'end')).toBe(false);
    expect(canShowLiveObservation('finish', 'offer')).toBe(true);
    trackLiveObservation('live_understood', 'nope');
    await flushNeedEvents();
    expect(fetch).not.toHaveBeenCalled();
    trackLiveObservation('live_understood', 'yes');
    await flushNeedEvents();
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body)) as { events: Array<{ name: string; version: string; props?: { rating?: string } }> };
    expect(body.events[0]).toMatchObject({ name: 'live_understood', version: LIVE_EVENT_VERSION, props: { rating: 'yes' } });
  });
});
