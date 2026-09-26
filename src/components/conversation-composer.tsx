"use client";

import { useRef, useState, type ReactNode } from "react";
import { CONVERSATION_SCENARIOS } from "@/lib/conversation-scenarios";
import { TONE_EXAMPLES } from "@/lib/chat-mock";
import type { ConversationState, ServerMode } from "@/lib/api";
import {
  resolveLiveDraftSource,
  type LiveOpeningExample,
} from "@/lib/live-opening-examples";
import { Icon } from "./need-ui";

type ConversationComposerProps = {
  mode: ServerMode | null;
  state: ConversationState;
  streaming: boolean;
  blocked: boolean;
  maxContentChars: number;
  suggestions: string[];
  openingExamples: LiveOpeningExample[];
  error: string | null;
  onSend: (input: {
    content: string;
    source: "typed" | "fixture";
    fixtureId?: string;
  }) => void;
  onStop: () => void;
  onResume: () => void;
  onEnd: () => void;
  onRetry: () => void;
  retryable?: boolean;
  tools?: ReactNode;
};

function suggestionText(id: string): string | null {
  for (const scenario of CONVERSATION_SCENARIOS) {
    const turn = scenario.turns.find((entry) => entry.id === id);
    if (turn) return turn.user;
  }
  const tone = TONE_EXAMPLES.find((example) => example.id === id);
  return tone ? tone.user : null;
}

export function ConversationComposer({
  mode,
  state,
  streaming,
  blocked,
  maxContentChars,
  suggestions,
  openingExamples,
  error,
  onSend,
  onStop,
  onResume,
  onEnd,
  onRetry,
  retryable = false,
  tools,
}: ConversationComposerProps) {
  const [draft, setDraft] = useState("");
  const [filledExample, setFilledExample] =
    useState<LiveOpeningExample | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const offer = state === "offer";
  const ended = state === "end" || blocked;
  const suggestionItems = suggestions.flatMap((id) => {
    const text = suggestionText(id);
    return text ? [{ id, text }] : [];
  });
  const showTray = offer && !streaming && !ended;
  const trayVisible = trayOpen && !ended;
  const hasTray = Boolean(tools) || suggestionItems.length > 0;
  const showInput = !ended;
  const busy = streaming;
  const sendDisabled = busy || ended || !draft.trim();
  const showOpeningExamples =
    mode === "live" && openingExamples.length > 0 && !ended;

  // 예시 채움 로컬 상태
  function fillExample(example: LiveOpeningExample) {
    setFilledExample(example);
    setDraft(example.text);
    setTrayOpen(false);
    textarea.current?.focus();
  }

  function openTray() {
    if (hasTray) setTrayOpen(true);
  }
  function closeTrayLater() {
    window.setTimeout(() => {
      if (!dock.current?.contains(document.activeElement)) setTrayOpen(false);
    }, 0);
  }

  function submit(
    source: "typed" | "fixture",
    text: string,
    fixtureId?: string,
  ) {
    const content = text.trim();
    if (!content || busy || ended) return;
    onSend({ content, source, fixtureId });
    setDraft("");
    setFilledExample(null);
    setTrayOpen(false);
    textarea.current?.blur();
  }

  function submitDraft() {
    const content = draft.trim();
    if (!content || busy || ended) return;
    if (mode === "live") {
      const resolved = resolveLiveDraftSource(draft, filledExample);
      onSend({
        content,
        source: resolved.source,
        ...(resolved.fixtureId ? { fixtureId: resolved.fixtureId } : {}),
      });
      setDraft("");
      setFilledExample(null);
      setTrayOpen(false);
      textarea.current?.blur();
      return;
    }
    submit("typed", draft);
  }

  return (
    <div className="nf-mock-composer" ref={dock}>
      {trayVisible && hasTray && showTray && (
        <div
          className={
            showOpeningExamples
              ? "nf-composer-float nf-composer-float-above-prompts"
              : "nf-composer-float"
          }
          role="region"
          aria-label="대화 도구와 예시"
          onMouseDown={(event) => event.preventDefault()}
        >
          {tools}
          {suggestionItems.length > 0 && (
            <div className="nf-first-prompts">
              {suggestionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    // 라이브 제안은 입력 채움
                    if (mode === "live") {
                      fillExample(item);
                      return;
                    }
                    submit("fixture", item.text, item.id);
                  }}
                >
                  {item.text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="nf-mock-status" role="status">
        {streaming
          ? "답변을 이어 쓰고 있어요…"
          : state === "pause"
            ? "질문을 멈췄어요. 이어서 말하려면 재개하거나 직접 입력해 주세요."
            : state === "wait"
              ? mode === "live"
                ? "원할 때만 이어서 말해 주세요."
                : "다음 예시는 숨겨 두었어요. 원할 때만 이어서 말해 주세요."
              : state === "end"
                ? "이 대화는 여기서 마쳤어요."
                : ""}
      </div>
      {error ? (
        <p className="nf-consent-error" role="status">
          {error}
        </p>
      ) : null}
      {(state === "wait" || state === "pause") && !ended && (
        <div className="nf-conversation-rest">
          <p>
            {state === "pause"
              ? "질문은 이 대화가 끝날 때까지 이어지지 않아요."
              : "더 말하지 않아도 돼요."}
          </p>
          <div>
            <button disabled={busy} onClick={onResume}>
              내가 더 이야기할게요
            </button>
            <button type="button" onClick={onEnd}>
              여기서 마치기
            </button>
          </div>
        </div>
      )}
      {state === "end" && (
        <div className="nf-conversation-rest">
          <p>입력과 예시 선택은 닫혀 있어요. 실시간 상담사 연결은 없어요.</p>
        </div>
      )}
      {showInput && (
        <>
          {showOpeningExamples && (
            <div className="nf-first-prompts" role="group" aria-label="시작 문장 예시">
              <p>이런 이야기로 시작해볼까요?</p>
              {openingExamples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  disabled={busy}
                  onClick={() => fillExample(example)}
                >
                  {example.text}
                </button>
              ))}
            </div>
          )}
          <form
            className="nf-mock-input"
            onSubmit={(event) => {
              event.preventDefault();
              submitDraft();
            }}
          >
            <label className="sr-only" htmlFor="live-message">
              메시지 입력
            </label>
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
              placeholder={
                state === "pause"
                  ? "이어서 말하고 싶으면 직접 입력해 주세요."
                  : "문장을 입력해 주세요."
              }
              onKeyDown={(event) => {
                if (event.key === "Escape" && trayOpen) {
                  event.preventDefault();
                  setTrayOpen(false);
                  return;
                }
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submitDraft();
                }
              }}
            />
            <button
              type="submit"
              disabled={sendDisabled}
              aria-label="메시지 보내기"
            >
              <Icon name="arrow" size={20} />
            </button>
            {busy ? (
              <button
                type="button"
                className="nf-stream-stop"
                onClick={onStop}
                aria-label="응답 중단"
              >
                <Icon name="close" size={18} />
              </button>
            ) : null}
          </form>
          <p className="nf-input-note">
            AI 대화예요. 실시간 상담사 연결은 없어요.
          </p>
          {error && retryable && !busy ? (
            <button className="nf-mock-retry" type="button" onClick={onRetry}>
              다시 시도
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
