'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiConfigError } from '@/lib/api/config';
import { createIdempotencyKey, isApiError, type ConversationState, type NeedCode, type ServerMode } from '@/lib/api';
import { getConsentStatus, type DeletionRecord } from '@/lib/api/consent';
import {
  consumeConversationStream,
  controlConversation,
  conversationErrorMessage,
  createConversation,
  deleteConversation,
  endConversation,
  isLiveFallbackError,
  listAllConversationMessages,
  parseCrisisEvent,
  parseDeltaEvent,
  parseDeltaReplaceEvent,
  parseDoneEvent,
  parseSessionMetaEvent,
  sendConversationMessage,
  type CrisisEvent,
  type DoneEvent,
  type HistoryMessage,
} from '@/lib/api/conversations';
import { setEventSurface } from '@/lib/need-events';

export type ChatLine = {
  messageId: string;
  role: 'mio' | 'user';
  source: 'typed' | 'fixture' | 'model';
  content: string;
  status: 'complete' | 'stopped' | 'failed' | 'streaming';
  fixtureId?: string;
};

export type DemoFallbackReason = 'live_mode_disabled' | 'live_budget_exhausted' | 'config';

export type StartConversationResult =
  | { ok: true; mode: ServerMode }
  | { ok: false; fallback: DemoFallbackReason | null; error: string };

type TurnAttempt = {
  content: string;
  source: 'typed' | 'fixture';
  fixtureId?: string;
  key: string;
};

function historyToLine(message: HistoryMessage): ChatLine {
  return {
    messageId: message.messageId,
    role: message.role,
    source: message.source,
    content: message.content,
    status: message.status,
  };
}

export function useConversationApi() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<ServerMode | null>(null);
  const [state, setState] = useState<ConversationState>('offer');
  const [stateVersion, setStateVersion] = useState(1);
  const [limits, setLimits] = useState({ maxUserTurns: 20, maxContentChars: 1000 });
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [crisis, setCrisis] = useState<CrisisEvent | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [deletion, setDeletion] = useState<DeletionRecord | null>(null);
  const debugRef = useRef<{ finishedReason: string | null; judgeStatus: string | null }>({
    finishedReason: null,
    judgeStatus: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const outMessageIdRef = useRef<string | null>(null);
  const stateVersionRef = useRef(1);
  const stateRef = useRef<ConversationState>('offer');
  const conversationIdRef = useRef<string | null>(null);
  const attemptRef = useRef<TurnAttempt | null>(null);
  const streamingRef = useRef(false);
  const blockedRef = useRef(false);

  const applyState = useCallback((next: ConversationState, version: number) => {
    if (version < stateVersionRef.current) return;
    stateVersionRef.current = version;
    stateRef.current = next;
    setStateVersion(version);
    setState(next);
  }, []);

  const upsert = useCallback((line: ChatLine) => {
    setMessages((current) => {
      const index = current.findIndex((item) => item.messageId === line.messageId);
      if (index === -1) return [...current, line];
      const next = [...current];
      next[index] = { ...next[index], ...line };
      return next;
    });
  }, []);

  const appendChunk = useCallback((msgId: string, chunk: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.messageId === msgId ? { ...item, content: item.content + chunk, status: 'streaming' } : item,
      ),
    );
  }, []);

  const replaceContent = useCallback((msgId: string, content: string) => {
    setMessages((current) =>
      current.map((item) => (item.messageId === msgId ? { ...item, content, status: 'streaming' } : item)),
    );
  }, []);

  async function restoreFromServer(id: string) {
    const listed = await listAllConversationMessages(id, false);
    applyState(listed.data.state, listed.data.stateVersion);
    setMode(listed.data.mode);
    setEventSurface(listed.data.mode);
    setMessages(listed.messages.map(historyToLine));
  }

  async function start(input: { need: NeedCode; scenarioId?: string }): Promise<StartConversationResult> {
    setError(null);
    setCrisis(null);
    setBlocked(false);
    blockedRef.current = false;
    setDeleted(false);
    setDeletion(null);
    setSuggestions([]);
    const previous = conversationIdRef.current;
    if (previous) {
      abortRef.current?.abort();
      try {
        await endConversation(previous, 'quiet');
      } catch {
        /* 이전 대화 종료 실패 무시 */
      }
    }
    try {
      const result = await createConversation(input);
      const data = result.data;
      conversationIdRef.current = data.conversationId;
      setConversationId(data.conversationId);
      setMode(data.mode);
      setEventSurface(data.mode);
      applyState(data.state, data.stateVersion);
      setLimits(data.limits);
      setMessages(
        data.opening
          ? [{
              messageId: data.opening.messageId,
              role: 'mio',
              source: 'fixture',
              content: data.opening.content,
              status: 'complete',
            }]
          : [],
      );
      return { ok: true, mode: data.mode };
    } catch (cause) {
      if (cause instanceof ApiConfigError) {
        return { ok: false, fallback: 'config', error: conversationErrorMessage(cause) };
      }
      if (isLiveFallbackError(cause) && isApiError(cause)) {
        const fallback = cause.code === 'LIVE_BUDGET_EXHAUSTED' ? 'live_budget_exhausted' : 'live_mode_disabled';
        return { ok: false, fallback, error: conversationErrorMessage(cause) };
      }
      setError(conversationErrorMessage(cause));
      return { ok: false, fallback: null, error: conversationErrorMessage(cause) };
    }
  }

  async function handleStreamEvent(block: { event: string; data: unknown }) {
    if (block.event === 'session_meta') {
      const meta = parseSessionMetaEvent(block.data);
      outMessageIdRef.current = meta.outMessageId;
      upsert({
        messageId: meta.messageId,
        role: 'user',
        source: attemptRef.current?.source ?? 'typed',
        content: attemptRef.current?.content ?? '',
        status: 'complete',
        fixtureId: attemptRef.current?.fixtureId,
      });
      upsert({
        messageId: meta.outMessageId,
        role: 'mio',
        source: 'model',
        content: '',
        status: 'streaming',
      });
      return;
    }
    if (block.event === 'delta') {
      const delta = parseDeltaEvent(block.data);
      appendChunk(delta.msgId, delta.chunk);
      return;
    }
    if (block.event === 'delta.replace') {
      const replaced = parseDeltaReplaceEvent(block.data);
      replaceContent(replaced.msgId, replaced.safeResponse);
      return;
    }
    if (block.event === 'crisis') {
      const next = parseCrisisEvent(block.data);
      setCrisis(next);
      if (next.flow === 'end' && next.fixedResponse) {
        const target = outMessageIdRef.current;
        if (target) {
          replaceContent(target, next.fixedResponse);
        } else {
          upsert({
            messageId: `crisis-${Date.now()}`,
            role: 'mio',
            source: 'fixture',
            content: next.fixedResponse,
            status: 'complete',
          });
        }
      }
      return;
    }
    if (block.event === 'done') {
      const done: DoneEvent = parseDoneEvent(block.data);
      debugRef.current = { finishedReason: done.finishedReason, judgeStatus: done.judgeStatus };
      applyState(done.state, done.stateVersion);
      setMode(done.mode);
      setEventSurface(done.mode);
      setSuggestions(done.interaction.suggestions);
      setMessages((current) =>
        current.map((item) =>
          item.messageId === done.msgId ? { ...item, status: 'complete', source: item.source === 'fixture' ? 'fixture' : 'model' } : item,
        ),
      );
    }
  }

  async function send(input: { content: string; source: 'typed' | 'fixture'; fixtureId?: string }): Promise<{
    ok: boolean;
    fallback?: DemoFallbackReason;
  }> {
    const id = conversationIdRef.current;
    if (!id || blockedRef.current || deleted || stateRef.current === 'end' || streamingRef.current) return { ok: false };
    const content = input.content.trim();
    const maxChars = limits.maxContentChars;
    if (content.length < 1 || content.length > maxChars) {
      setError('입력 길이를 확인해 주세요');
      return { ok: false };
    }
    const previous = attemptRef.current;
    const sameTurn = previous && previous.content === content && previous.source === input.source && previous.fixtureId === input.fixtureId;
    const key = sameTurn ? previous.key : createIdempotencyKey();
    attemptRef.current = { content, source: input.source, fixtureId: input.fixtureId, key };
    const controller = new AbortController();
    abortRef.current = controller;
    streamingRef.current = true;
    setStreaming(true);
    setError(null);
    try {
      const response = await sendConversationMessage({
        conversationId: id,
        content,
        source: input.source,
        fixtureId: input.source === 'fixture' ? input.fixtureId : null,
        stateVersion: stateVersionRef.current,
        idempotencyKey: key,
        signal: controller.signal,
      });
      const { receivedDone } = await consumeConversationStream(response, handleStreamEvent, controller.signal);
      if (!receivedDone && !controller.signal.aborted) {
        setError('응답을 끝까지 받지 못했어요');
      }
      return { ok: receivedDone };
    } catch (cause) {
      if (controller.signal.aborted) return { ok: false };
      if (isLiveFallbackError(cause) && isApiError(cause)) {
        const fallback = cause.code === 'LIVE_BUDGET_EXHAUSTED' ? 'live_budget_exhausted' : 'live_mode_disabled';
        setError(conversationErrorMessage(cause));
        return { ok: false, fallback };
      }
      if (isApiError(cause) && cause.code === 'CONFLICT') {
        try {
          await restoreFromServer(id);
        } catch {
          setError(conversationErrorMessage(cause));
        }
        return { ok: false };
      }
      if (isApiError(cause) && cause.code === 'GONE') {
        applyState('end', stateVersionRef.current);
        blockedRef.current = true;
        setBlocked(true);
        setError(conversationErrorMessage(cause));
        return { ok: false };
      }
      if (isApiError(cause) && cause.code === 'CONVERSATION_MESSAGE_IN_PROGRESS') {
        setError(conversationErrorMessage(cause));
        return { ok: false };
      }
      setError(conversationErrorMessage(cause));
      return { ok: false };
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function stopListening(): Promise<void> {
    const id = conversationIdRef.current;
    const target = outMessageIdRef.current;
    abortRef.current?.abort();
    if (!id || !target) return;
    try {
      const result = await controlConversation(id, {
        action: 'stop',
        targetMessageId: target,
        stateVersion: stateVersionRef.current,
      });
      applyState(result.data.state, result.data.stateVersion);
      if (result.data.stoppedMessageId) {
        setMessages((current) =>
          current.map((item) =>
            item.messageId === result.data.stoppedMessageId ? { ...item, status: 'stopped' } : item,
          ),
        );
      }
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'GONE') {
        applyState('end', stateVersionRef.current);
        blockedRef.current = true;
        setBlocked(true);
      } else {
        setError(conversationErrorMessage(cause));
      }
    }
  }

  async function resumeTalking(): Promise<void> {
    const id = conversationIdRef.current;
    if (!id || streamingRef.current) return;
    try {
      const result = await controlConversation(id, {
        action: 'resume',
        stateVersion: stateVersionRef.current,
      });
      applyState(result.data.state, result.data.stateVersion);
    } catch (cause) {
      setError(conversationErrorMessage(cause));
    }
  }

  async function finishConversation(reason: 'user_end' | 'quiet'): Promise<boolean> {
    const id = conversationIdRef.current;
    abortRef.current?.abort();
    if (!id) return true;
    try {
      const result = await endConversation(id, reason);
      applyState('end', result.data.stateVersion);
      setSuggestions([]);
      return true;
    } catch (cause) {
      if (isApiError(cause) && (cause.code === 'NOT_FOUND' || cause.code === 'UNAUTHORIZED')) {
        setError(conversationErrorMessage(cause));
        return false;
      }
      setError(conversationErrorMessage(cause));
      return false;
    }
  }

  async function removeConversation(): Promise<void> {
    const id = conversationIdRef.current;
    abortRef.current?.abort();
    if (!id) return;
    try {
      const result = await deleteConversation(id);
      setDeleted(true);
      blockedRef.current = true;
      setBlocked(true);
      setSuggestions([]);
      const status = await getConsentStatus(result.data.operationId);
      setDeletion(status.data.deletions.find((item) => item.operationId === result.data.operationId) ?? null);
    } catch (cause) {
      setError(conversationErrorMessage(cause));
    }
  }

  async function cancelActiveStream(): Promise<void> {
    if (!streamingRef.current) {
      abortRef.current?.abort();
      return;
    }
    await stopListening();
  }

  function retryLast() {
    const attempt = attemptRef.current;
    if (!attempt) return Promise.resolve({ ok: false as const });
    return send(attempt);
  }

  function resetConversation() {
    abortRef.current?.abort();
    conversationIdRef.current = null;
    outMessageIdRef.current = null;
    attemptRef.current = null;
    streamingRef.current = false;
    blockedRef.current = false;
    stateRef.current = 'offer';
    stateVersionRef.current = 1;
    debugRef.current = { finishedReason: null, judgeStatus: null };
    setConversationId(null);
    setMode(null);
    setState('offer');
    setStateVersion(1);
    setMessages([]);
    setSuggestions([]);
    setCrisis(null);
    setStreaming(false);
    setBlocked(false);
    setError(null);
    setDeleted(false);
    setDeletion(null);
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    conversationId,
    mode,
    state,
    stateVersion,
    limits,
    messages,
    suggestions,
    crisis,
    streaming,
    blocked: blocked || deleted || state === 'end',
    deleted,
    deletion,
    error,
    start,
    send,
    stopListening,
    resumeTalking,
    finishConversation,
    removeConversation,
    cancelActiveStream,
    restoreFromServer,
    resetConversation,
    retryLast,
  };
}
