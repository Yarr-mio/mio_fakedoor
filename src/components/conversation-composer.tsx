'use client';

import { useRef, useState, type ReactNode } from 'react';
import { scenarioById, nextScenarioTurn, completedScenarioTurns } from '@/lib/conversation-scenarios';
import { TONE_EXAMPLES } from '@/lib/chat-mock';
import type { Need } from '@/lib/need-flow';
import type { ConversationState, ServerMode } from '@/lib/api';
import type { ChatLine } from '@/lib/use-conversation-api';
import { Icon } from './need-ui';

type ConversationComposerProps = {
  need: Need;
  mode: ServerMode | null;
  state: ConversationState;
  streaming: boolean;
  blocked: boolean;
  maxContentChars: number;
  suggestions: string[];
  messages: ChatLine[];
  scenarioId: string | null;
  error: string | null;
  onSend: (input: { content: string; source: 'typed' | 'fixture'; fixtureId?: string }) => void;
  onStop: () => void;
  onResume: () => void;
  onEnd: () => void;
  onRetry: () => void;
  tools?: ReactNode;
};

export function ConversationComposer({
  need,
  mode,
  state,
  streaming,
  blocked,
  maxContentChars,
  suggestions,
  messages,
  scenarioId,
  error,
  onSend,
  onStop,
  onResume,
  onEnd,
  onRetry,
  tools,
}: ConversationComposerProps) {
  const [draft, setDraft] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const hasUserMessage = messages.some((message) => message.role === 'user');
  const scenario = mode === 'scripted_demo' ? scenarioById(scenarioId) : undefined;
  const nextTurn = mode === 'scripted_demo' ? nextScenarioTurn(scenarioId, messages.map((message) => ({
    role: message.role,
    text: message.content,
    source: message.source === 'fixture' ? 'fixture' : message.source === 'typed' ? 'typed' : 'mock',
    fixtureId: message.fixtureId,
  }))) : undefined;
  const completed = mode === 'scripted_demo' ? completedScenarioTurns(scenarioId, messages.map((message) => ({
    role: message.role,
    text: message.content,
    source: message.source === 'fixture' ? 'fixture' : message.source === 'typed' ? 'typed' : 'mock',
    fixtureId: message.fixtureId,
  }))) : 0;
  const offer = state === 'offer';
  const ended = state === 'end' || blocked;
  const trayVisible = trayOpen && !ended;
  const showExamples = offer && !streaming && !ended;
  const showInput = !ended;
  const startersVisible = showExamples && !hasUserMessage && !scenario;
  const scenarioVisible = Boolean(showExamples && scenario);
  const suggestionTurns = suggestions
    .map((id) => {
      for (const item of scenario ? [scenario] : []) {
        const turn = item.turns.find((entry) => entry.id === id);
        if (turn) return turn;
      }
      return undefined;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const hasTray = Boolean(tools) || startersVisible || scenarioVisible || suggestionTurns.length > 0;
  const busy = streaming;
  const sendDisabled = busy || ended || !draft.trim();
  const starters = need === 'perspective' ? [TONE_EXAMPLES[2], TONE_EXAMPLES[1], TONE_EXAMPLES[0]] : [TONE_EXAMPLES[0], TONE_EXAMPLES[1], TONE_EXAMPLES[2]];

  function openTray() {
    if (hasTray) setTrayOpen(true);
  }
  function closeTrayLater() {
    window.setTimeout(() => {
      if (!dock.current?.contains(document.activeElement)) setTrayOpen(false);
    }, 0);
  }

  function submit(source: 'typed' | 'fixture', text: string, fixtureId?: string) {
    const content = text.trim();
    if (!content || busy || ended) return;
    onSend({ content, source, fixtureId });
    setDraft('');
    setTrayOpen(false);
    textarea.current?.blur();
  }

  return (
    <div className="nf-mock-composer" ref={dock}>
      {trayVisible && hasTray && showExamples && (
        <div className="nf-composer-float" role="region" aria-label="대화 도구와 예시" onMouseDown={(event) => event.preventDefault()}>
          {tools}
          {startersVisible && (
            <div className="nf-first-prompts">
              <p>이런 이야기로 시작해볼까요?</p>
              {starters.map((example) => (
                <button key={example.id} disabled={busy} onClick={() => { setDraft(example.user); textarea.current?.focus(); }}>
                  {example.user}
                </button>
              ))}
            </div>
          )}
          {scenarioVisible && (
            <div className="nf-scenario-current">
              <div>
                <strong>{scenario?.title}</strong>
                <span>{completed} / {scenario?.turns.length} 대화</span>
              </div>
              {nextTurn ? (
                <button className="nf-scenario-next" disabled={busy} onClick={() => { setDraft(nextTurn.user); textarea.current?.focus(); }}>
                  {completed ? '이어서 이야기하기' : '이 이야기로 시작하기'}
                  <span>{nextTurn.user}</span>
                </button>
              ) : (
                <p>이 예시는 여기까지예요. 마무리를 누르거나 다른 상황을 살펴볼 수 있어요.</p>
              )}
            </div>
          )}
          {suggestionTurns.length > 0 && (
            <div className="nf-first-prompts">
              {suggestionTurns.map((turn) => (
                <button key={turn.id} disabled={busy} onClick={() => { setDraft(turn.user); textarea.current?.focus(); }}>
                  {turn.user}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="nf-mock-status" role="status">
        {streaming ? '답변을 이어 쓰고 있어요…' : state === 'pause' ? '질문을 멈췄어요. 이어서 말하려면 재개하거나 직접 입력해 주세요.' : state === 'wait' ? '다음 예시는 숨겨 두었어요. 원할 때만 이어서 말해 주세요.' : state === 'end' ? '이 대화는 여기서 마쳤어요.' : ''}
      </div>
      {error ? <p className="nf-consent-error" role="status">{error}</p> : null}
      {(state === 'wait' || state === 'pause') && !ended && (
        <div className="nf-conversation-rest">
          <p>{state === 'pause' ? '질문은 이 대화가 끝날 때까지 이어지지 않아요.' : '더 말하지 않아도 돼요.'}</p>
          <div>
            <button disabled={busy} onClick={onResume}>내가 더 이야기할게요</button>
            <button type="button" onClick={onEnd}>여기서 마치기</button>
          </div>
        </div>
      )}
      {state === 'end' && (
        <div className="nf-conversation-rest">
          <p>입력과 예시 선택은 닫혀 있어요. 실시간 상담사 연결은 없어요.</p>
        </div>
      )}
      {showInput && (
        <>
          <form className="nf-mock-input" onSubmit={(event) => {
            event.preventDefault();
            const fixture = TONE_EXAMPLES.find((example) => example.user === draft.trim())
              ?? (nextTurn?.user === draft.trim() ? nextTurn : undefined);
            submit(fixture ? 'fixture' : 'typed', draft, fixture && 'id' in fixture ? fixture.id : undefined);
          }}>
            <label className="sr-only" htmlFor="live-message">메시지 입력</label>
            <textarea
              ref={textarea}
              id="live-message"
              rows={2}
              maxLength={maxContentChars}
              value={draft}
              disabled={ended}
              onFocus={openTray}
              onBlur={closeTrayLater}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={state === 'pause' ? '이어서 말하고 싶으면 직접 입력해 주세요.' : '예시를 고르거나 문장을 입력해 주세요.'}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && trayOpen) {
                  event.preventDefault();
                  setTrayOpen(false);
                  return;
                }
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  const fixture = TONE_EXAMPLES.find((example) => example.user === draft.trim())
                    ?? (nextTurn?.user === draft.trim() ? nextTurn : undefined);
                  submit(fixture ? 'fixture' : 'typed', draft, fixture && 'id' in fixture ? fixture.id : undefined);
                }
              }}
            />
            {busy ? (
              <button type="button" onClick={onStop} aria-label="그만 듣기">그만 듣기</button>
            ) : (
              <button type="submit" disabled={sendDisabled} aria-label="메시지 보내기">
                <Icon name="arrow" size={20} />
              </button>
            )}
          </form>
          <p className="nf-input-note">AI 대화예요. 실시간 상담사 연결은 없어요.</p>
          {error && !busy ? <button className="nf-mock-retry" type="button" onClick={onRetry}>같은 요청으로 다시 보내기</button> : null}
        </>
      )}
    </div>
  );
}
