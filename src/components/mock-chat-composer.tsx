'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { scenarioById, nextScenarioTurn, completedScenarioTurns } from '@/lib/conversation-scenarios';
import { mockReplyFor, TONE_EXAMPLES } from '@/lib/chat-mock';
import type { DemoMessage, Need } from '@/lib/need-flow';
import { trackNeed } from '@/lib/need-events';
import { useInternalMode } from '@/lib/use-internal-mode';
import type { MockFollowUp } from '@/lib/mock-dialogue-policy';
import { Icon } from './need-ui';

type Status = 'idle' | 'waiting' | 'streaming' | 'stopped' | 'error';
export function MockChatComposer({ need, hasUserMessage, scenarioId, messages, followUp, onResume, onEnd, onMessage, onPreview, tools }: { need: Need; hasUserMessage: boolean; scenarioId: string | null; messages: DemoMessage[]; followUp: MockFollowUp; onResume:()=>void; onEnd:()=>void; onMessage: (message: DemoMessage) => void; onPreview: (text: string) => void; tools?: ReactNode }) {
  const internal = useInternalMode();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [failNext, setFailNext] = useState(false);
  const task = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const lastReply = useRef('');
  const lastFixtureId = useRef<string | undefined>(undefined);
  const scenario = scenarioById(scenarioId);
  const nextTurn = nextScenarioTurn(scenarioId, messages);
  const completed = completedScenarioTurns(scenarioId, messages);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const busy = status === 'waiting' || status === 'streaming';
  const offerNext = followUp === 'offer';
  const startersVisible = !hasUserMessage && !scenario;
  const scenarioVisible = Boolean(scenario && offerNext);
  const hasTray = Boolean(tools) || startersVisible || scenarioVisible;

  function openTray() {
    if (hasTray) setTrayOpen(true);
  }
  function closeTrayLater() {
    window.setTimeout(() => {
      if (!dock.current?.contains(document.activeElement)) setTrayOpen(false);
    }, 0);
  }

  useEffect(() => () => {
    generation.current++;
    if (task.current) clearTimeout(task.current);
    onPreview('');
  }, [onPreview]);

  function play(reply: string, fail: boolean, fixtureId?: string) {
    if (pending.current) return;
    pending.current = true;
    const id = ++generation.current;
    lastReply.current = reply; lastFixtureId.current = fixtureId;
    setStatus('waiting'); onPreview('');
    trackNeed('mock_response_started', { need });
    task.current = setTimeout(() => {
      if (id !== generation.current) return;
      if (fail) { pending.current = false; setStatus('error'); trackNeed('mock_response_failed'); return; }
      setStatus('streaming');
      let end = 0;
      const tick = () => {
        if (id !== generation.current) return;
        end = Math.min(reply.length, end + 6);
        onPreview(reply.slice(0, end));
        if (end < reply.length) task.current = setTimeout(tick, 65);
        else { pending.current = false; setStatus('idle'); onPreview(''); onMessage({ role: 'mio', text: reply, source: 'mock', ...(fixtureId ? { fixtureId } : {}) }); trackNeed('mock_response_completed'); }
      };
      tick();
    }, 850);
  }
  function send() {
    const text = draft.trim();
    if (!text || pending.current) return;
    const scenarioTurn = nextTurn?.user === text ? nextTurn : undefined;
    const fixture = scenarioTurn ?? TONE_EXAMPLES.find(example => example.user === text);
    const alreadySent = scenarioTurn && messages.some(message => message.role === 'user' && message.fixtureId === scenarioTurn.id);
    if (!alreadySent) onMessage({ role: 'user', text, source: fixture ? 'fixture' : 'typed', ...(scenarioTurn ? { fixtureId:scenarioTurn.id } : {}) });
    if (!alreadySent) trackNeed(fixture ? 'mock_fixture_sent' : 'mock_input_sent', { need, ...(scenarioTurn ? { resource:scenarioTurn.id } : {}) });
    setDraft('');
    setTrayOpen(false);
    textarea.current?.blur();
    play(scenarioTurn?.reply ?? mockReplyFor(text, need), failNext, scenarioTurn?.id); setFailNext(false);
  }
  function stop() {
    generation.current++; if (task.current) clearTimeout(task.current);
    pending.current = false; onPreview(''); setStatus('stopped'); trackNeed('mock_response_stopped');
  }
  const starters = need === 'perspective' ? [TONE_EXAMPLES[2], TONE_EXAMPLES[1], TONE_EXAMPLES[0]] : [TONE_EXAMPLES[0], TONE_EXAMPLES[1], TONE_EXAMPLES[2]];
  return <div className="nf-mock-composer" ref={dock}>
    {trayOpen && hasTray && (
      <div className="nf-composer-float" role="region" aria-label="대화 도구와 예시" onMouseDown={(event) => event.preventDefault()}>
        {tools}
        {startersVisible && <div className="nf-first-prompts"><p>이런 이야기로 시작해볼까요?</p>{starters.map(example => <button key={example.id} disabled={busy} onClick={() => { setDraft(example.user); textarea.current?.focus(); }}>{example.user}</button>)}</div>}
        {scenarioVisible && <div className="nf-scenario-current"><div><strong>{scenario?.title}</strong><span>{completed} / {scenario?.turns.length} 대화</span></div>{nextTurn ? <button className="nf-scenario-next" disabled={busy} onClick={() => { setDraft(nextTurn.user); textarea.current?.focus(); }}>{completed ? '이어서 이야기하기' : '이 이야기로 시작하기'}<span>{nextTurn.user}</span></button> : <p>이 예시는 여기까지예요. 마무리를 누르거나 다른 상황을 살펴볼 수 있어요.</p>}</div>}
      </div>
    )}
    <div className="nf-mock-status" role="status">{status === 'waiting' ? '답변을 준비하고 있어요…' : status === 'streaming' ? '답변을 이어 쓰고 있어요…' : status === 'stopped' ? '응답 표시를 멈췄어요. 다시 보거나 다른 방향으로 이동할 수 있어요.' : status === 'error' ? '응답 실패 화면 예시예요. 실제 서버 장애가 아닙니다.' : ''}</div>
    {(status === 'error' || status === 'stopped') && <button className="nf-mock-retry" onClick={() => { trackNeed('mock_response_retried'); play(lastReply.current, false, lastFixtureId.current); }}>답변 다시 보기 <Icon name="arrow" size={15} /></button>}
    {!offerNext && <div className="nf-conversation-rest">
      <p>{followUp === 'pause' ? '질문을 멈췄어요.' : followUp === 'end' ? '더 답하지 않고 마칠 수 있어요.' : '더 말하지 않아도 돼요.'}</p>
      <div>{followUp !== 'end' && <button disabled={busy} onClick={onResume}>내가 더 이야기할게요</button>}<button onClick={onEnd}>여기서 마치기</button></div>
    </div>}
    {followUp !== 'end' && <>
    <form className="nf-mock-input" onSubmit={event => { event.preventDefault(); send(); }}>
      <label className="sr-only" htmlFor="mock-message">메시지 입력</label>
      <textarea ref={textarea} id="mock-message" rows={2} maxLength={1000} value={draft} onFocus={openTray} onBlur={closeTrayLater} onChange={event => setDraft(event.target.value)} placeholder="예시를 고르거나, 가상의 문장을 입력해보세요." onKeyDown={event => { if (event.key === 'Escape' && trayOpen) { event.preventDefault(); setTrayOpen(false); return; } if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
      {busy ? <button type="button" onClick={stop} aria-label="응답 표시 중단"><span aria-hidden="true">■</span></button> : <button type="submit" disabled={!draft.trim()} aria-label="메시지 보내기"><Icon name="arrow" size={20} /></button>}
    </form>
    <p className="nf-input-note">실제 개인정보 대신 가상의 문장을 입력해주세요.</p>
    </>}
    {internal && <details className="nf-mock-test"><summary>목업 상태 테스트</summary><label><input type="checkbox" checked={failNext} disabled={busy} onChange={event => setFailNext(event.target.checked)} />다음 응답에서 실패·재시도 화면 보기</label><div className="nf-sample-chips">{TONE_EXAMPLES.map(example => <button key={example.id} disabled={busy} onClick={() => { setDraft(example.user); textarea.current?.focus(); }}>{example.label}<span>{example.user}</span></button>)}</div><p>화면 이동 시 진행 중인 목업 응답은 취소됩니다. 미완성 응답은 대화에 남기지 않습니다.</p></details>}
  </div>;
}
