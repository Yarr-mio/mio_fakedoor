"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiConfigError } from "@/lib/api/config";
import {
  createIdempotencyKey,
  isApiError,
  type ConversationState,
  type NeedCode,
  type ServerMode,
} from "@/lib/api";
import { getConsentStatus, type DeletionRecord } from "@/lib/api/consent";
import {
  consumeConversationStream,
  controlConversation,
  conversationErrorMessage,
  createConversation,
  createConversationSummary,
  deleteConversation,
  endConversation,
  getConversationSummary,
  isLiveFallbackError,
  listAllConversationMessages,
  parseCrisisEvent,
  parseDeltaEvent,
  parseDeltaReplaceEvent,
  parseDoneEvent,
  parseSessionMetaEvent,
  sendConversationMessage,
  summaryErrorMessage,
  type ConversationSummaryData,
  type CrisisEvent,
  type DoneEvent,
  type HistoryMessage,
  type ListMessagesData,
} from "@/lib/api/conversations";
import { setEventSurface } from "@/lib/need-events";
import { bootstrapVisit } from "@/lib/visit-session";

export type ChatLine = {
  messageId: string;
  role: "mio" | "user";
  source: "typed" | "fixture" | "model";
  content: string;
  status: "complete" | "stopped" | "failed" | "streaming";
  fixtureId?: string;
};

export type DemoFallbackReason =
  | "live_mode_disabled"
  | "live_budget_exhausted"
  | "config";

export type StartConversationResult =
  | { ok: true; mode: ServerMode }
  | { ok: false; fallback: DemoFallbackReason | null; error: string };

type TurnAttempt = {
  content: string;
  source: "typed" | "fixture";
  fixtureId?: string;
  key: string;
  localId: string;
};

export type SessionResume = {
  conversationId: string;
  state: ConversationState;
};

let hydratePromise: Promise<ListMessagesData> | null = null;
let hydrateConversationId: string | null = null;

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
  const [state, setState] = useState<ConversationState>("offer");
  const [stateVersion, setStateVersion] = useState(1);
  const [limits, setLimits] = useState({
    maxUserTurns: 20,
    maxContentChars: 1000,
  });
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [crisis, setCrisis] = useState<CrisisEvent | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deletion, setDeletion] = useState<DeletionRecord | null>(null);
  const [summary, setSummary] = useState<ConversationSummaryData | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [sessionResume, setSessionResume] = useState<SessionResume | null>(
    null,
  );
  const debugRef = useRef<{
    finishedReason: string | null;
    judgeStatus: string | null;
  }>({
    finishedReason: null,
    judgeStatus: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const outMessageIdRef = useRef<string | null>(null);
  const stateVersionRef = useRef(1);
  const stateRef = useRef<ConversationState>("offer");
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
      const index = current.findIndex(
        (item) => item.messageId === line.messageId,
      );
      if (index === -1) return [...current, line];
      const next = [...current];
      next[index] = { ...next[index], ...line };
      return next;
    });
  }, []);

  const appendChunk = useCallback((msgId: string, chunk: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.messageId === msgId
          ? { ...item, content: item.content + chunk, status: "streaming" }
          : item,
      ),
    );
  }, []);

  const replaceContent = useCallback((msgId: string, content: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.messageId === msgId
          ? { ...item, content, status: "streaming" }
          : item,
      ),
    );
  }, []);

  const applyListedConversation = useCallback(
    (id: string, listed: ListMessagesData) => {
      conversationIdRef.current = id;
      setConversationId(id);
      applyState(listed.state, listed.stateVersion);
      setMode(listed.mode);
      setEventSurface(listed.mode);
      setMessages(listed.messages.map(historyToLine));
      setSuggestions([]);
      if (listed.state === "end") {
        blockedRef.current = true;
        setBlocked(true);
      }
    },
    [applyState],
  );

  const restoreFromServer = useCallback(
    async (
      id: string,
      options?: { force?: boolean; asSessionResume?: boolean },
    ) => {
      // 복원 대화 재조회 생략
      if (!options?.force && hydrateConversationId === id && hydratePromise) {
        const listed = await hydratePromise;
        if (
          options?.asSessionResume &&
          conversationIdRef.current &&
          conversationIdRef.current !== id
        ) {
          return listed;
        }
        applyListedConversation(id, listed);
        if (options?.asSessionResume)
          setSessionResume({ conversationId: id, state: listed.state });
        return listed;
      }
      hydrateConversationId = id;
      hydratePromise = listAllConversationMessages(id, false).then(
        (result) => result.data,
      );
      const listed = await hydratePromise;
      if (
        options?.asSessionResume &&
        conversationIdRef.current &&
        conversationIdRef.current !== id
      ) {
        return listed;
      }
      applyListedConversation(id, listed);
      if (options?.asSessionResume)
        setSessionResume({ conversationId: id, state: listed.state });
      return listed;
    },
    [applyListedConversation],
  );

  async function start(input: {
    need: NeedCode;
    scenarioId?: string;
  }): Promise<StartConversationResult> {
    setError(null);
    setRetryable(false);
    setCrisis(null);
    setSummary(null);
    setSummaryError(null);
    setBlocked(false);
    blockedRef.current = false;
    setDeleted(false);
    setDeletion(null);
    setSuggestions([]);
    const previous = conversationIdRef.current;
    if (previous) {
      abortRef.current?.abort();
      try {
        await endConversation(previous, "quiet");
      } catch {
        /* 이전 대화 종료 실패 무시 */
      }
    }
    try {
      const result = await createConversation(input);
      const data = result.data;
      conversationIdRef.current = data.conversationId;
      hydrateConversationId = data.conversationId;
      hydratePromise = null;
      setConversationId(data.conversationId);
      setMode(data.mode);
      setEventSurface(data.mode);
      applyState(data.state, data.stateVersion);
      setLimits(data.limits);
      setMessages(
        data.opening
          ? [
              {
                messageId: data.opening.messageId,
                role: "mio",
                source: "fixture",
                content: data.opening.content,
                status: "complete",
              },
            ]
          : [],
      );
      return { ok: true, mode: data.mode };
    } catch (cause) {
      if (cause instanceof ApiConfigError) {
        return {
          ok: false,
          fallback: "config",
          error: conversationErrorMessage(cause),
        };
      }
      if (isLiveFallbackError(cause) && isApiError(cause)) {
        const fallback =
          cause.code === "LIVE_BUDGET_EXHAUSTED"
            ? "live_budget_exhausted"
            : "live_mode_disabled";
        return { ok: false, fallback, error: conversationErrorMessage(cause) };
      }
      setError(conversationErrorMessage(cause));
      return {
        ok: false,
        fallback: null,
        error: conversationErrorMessage(cause),
      };
    }
  }

  async function handleStreamEvent(block: { event: string; data: unknown }) {
    if (block.event === "session_meta") {
      const meta = parseSessionMetaEvent(block.data);
      outMessageIdRef.current = meta.outMessageId;
      const localId = attemptRef.current?.localId;
      if (localId && localId !== meta.messageId) {
        setMessages((current) =>
          current.map((item) =>
            item.messageId === localId
              ? { ...item, messageId: meta.messageId, status: "complete" }
              : item,
          ),
        );
        if (attemptRef.current) {
          attemptRef.current = {
            ...attemptRef.current,
            localId: meta.messageId,
          };
        }
      } else {
        upsert({
          messageId: meta.messageId,
          role: "user",
          source: attemptRef.current?.source ?? "typed",
          content: attemptRef.current?.content ?? "",
          status: "complete",
          fixtureId: attemptRef.current?.fixtureId,
        });
      }
      upsert({
        messageId: meta.outMessageId,
        role: "mio",
        source: "model",
        content: "",
        status: "streaming",
      });
      return;
    }
    if (block.event === "delta") {
      const delta = parseDeltaEvent(block.data);
      appendChunk(delta.msgId, delta.chunk);
      return;
    }
    if (block.event === "delta.replace") {
      const replaced = parseDeltaReplaceEvent(block.data);
      replaceContent(replaced.msgId, replaced.safeResponse);
      return;
    }
    if (block.event === "crisis") {
      // 서버 flow 값만 사용
      const next = parseCrisisEvent(block.data);
      setCrisis(next);
      if (next.flow === "end" && next.fixedResponse) {
        const target = outMessageIdRef.current;
        if (target) {
          replaceContent(target, next.fixedResponse);
        } else {
          upsert({
            messageId: `crisis-${Date.now()}`,
            role: "mio",
            source: "fixture",
            content: next.fixedResponse,
            status: "complete",
          });
        }
      }
      return;
    }
    if (block.event === "done") {
      const done: DoneEvent = parseDoneEvent(block.data);
      debugRef.current = {
        finishedReason: done.finishedReason,
        judgeStatus: done.judgeStatus,
      };
      applyState(done.state, done.stateVersion);
      setMode(done.mode);
      setEventSurface(done.mode);
      setSuggestions(done.interaction.suggestions);
      // error만 오류 화면
      const streamError = done.finishedReason === "error";
      setMessages((current) =>
        current.map((item) =>
          item.messageId === done.msgId
            ? {
                ...item,
                status: streamError ? "failed" : "complete",
                source: item.source === "fixture" ? "fixture" : "model",
              }
            : item,
        ),
      );
      if (streamError) {
        setRetryable(true);
        setError("응답을 만들지 못했어요");
      } else {
        setRetryable(false);
        setError(null);
      }
    }
  }

  async function send(input: {
    content: string;
    source: "typed" | "fixture";
    fixtureId?: string;
  }): Promise<{
    ok: boolean;
    fallback?: DemoFallbackReason;
  }> {
    const id = conversationIdRef.current;
    if (
      !id ||
      blockedRef.current ||
      deleted ||
      stateRef.current === "end" ||
      streamingRef.current
    )
      return { ok: false };
    const content = input.content.trim();
    const maxChars = limits.maxContentChars;
    if (content.length < 1 || content.length > maxChars) {
      setError("입력 길이를 확인해 주세요");
      return { ok: false };
    }
    const previous = attemptRef.current;
    const sameTurn =
      previous &&
      previous.content === content &&
      previous.source === input.source &&
      previous.fixtureId === input.fixtureId;
    const key = sameTurn ? previous.key : createIdempotencyKey();
    const localId = sameTurn
      ? previous.localId
      : `local-user-${crypto.randomUUID()}`;
    attemptRef.current = {
      content,
      source: input.source,
      fixtureId: input.fixtureId,
      key,
      localId,
    };
    // 사용자 말풍선 즉시 표시
    upsert({
      messageId: localId,
      role: "user",
      source: input.source,
      content,
      status: "complete",
      fixtureId: input.fixtureId,
    });
    const controller = new AbortController();
    abortRef.current = controller;
    streamingRef.current = true;
    setStreaming(true);
    setError(null);
    setRetryable(false);
    try {
      const response = await sendConversationMessage({
        conversationId: id,
        content,
        source: input.source,
        fixtureId: input.source === "fixture" ? input.fixtureId : null,
        stateVersion: stateVersionRef.current,
        idempotencyKey: key,
        signal: controller.signal,
      });
      const { receivedDone } = await consumeConversationStream(
        response,
        handleStreamEvent,
        controller.signal,
      );
      if (!receivedDone && !controller.signal.aborted) {
        setRetryable(true);
        setError("응답을 끝까지 받지 못했어요");
      }
      return { ok: receivedDone };
    } catch (cause) {
      if (controller.signal.aborted) return { ok: false };
      setMessages((current) =>
        current.map((item) =>
          item.messageId === localId ? { ...item, status: "failed" } : item,
        ),
      );
      if (isLiveFallbackError(cause) && isApiError(cause)) {
        const fallback =
          cause.code === "LIVE_BUDGET_EXHAUSTED"
            ? "live_budget_exhausted"
            : "live_mode_disabled";
        setRetryable(false);
        setError(conversationErrorMessage(cause));
        return { ok: false, fallback };
      }
      if (isApiError(cause) && cause.code === "CONFLICT") {
        try {
          await restoreFromServer(id, { force: true });
        } catch {
          setRetryable(true);
          setError(conversationErrorMessage(cause));
        }
        return { ok: false };
      }
      if (isApiError(cause) && cause.code === "GONE") {
        applyState("end", stateVersionRef.current);
        blockedRef.current = true;
        setBlocked(true);
        setRetryable(false);
        setError(conversationErrorMessage(cause));
        return { ok: false };
      }
      if (
        isApiError(cause) &&
        cause.code === "CONVERSATION_MESSAGE_IN_PROGRESS"
      ) {
        setRetryable(true);
        setError(conversationErrorMessage(cause));
        return { ok: false };
      }
      setRetryable(true);
      setError(conversationErrorMessage(cause));
      return { ok: false };
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  const stopActiveTurn = useCallback(
    async (wait: boolean): Promise<void> => {
      const id = conversationIdRef.current;
      const target = outMessageIdRef.current;
      const version = stateVersionRef.current;
      const inFlight = streamingRef.current;
      abortRef.current?.abort();
      if (!id || !target) return;
      if (!wait && !inFlight) return;
      const request = controlConversation(
        id,
        {
          action: "stop",
          targetMessageId: target,
          stateVersion: version,
        },
        { keepalive: !wait },
      );
      // 언마운트 중단 요청 대기 없음
      if (!wait) return;
      try {
        const result = await request;
        applyState(result.data.state, result.data.stateVersion);
        if (result.data.stoppedMessageId) {
          setMessages((current) =>
            current.map((item) =>
              item.messageId === result.data.stoppedMessageId
                ? { ...item, status: "stopped" }
                : item,
            ),
          );
        }
      } catch (cause) {
        if (isApiError(cause) && cause.code === "GONE") {
          applyState("end", stateVersionRef.current);
          blockedRef.current = true;
          setBlocked(true);
        } else {
          setError(conversationErrorMessage(cause));
        }
      }
    },
    [applyState],
  );

  async function stopListening(): Promise<void> {
    await stopActiveTurn(true);
  }

  async function resumeTalking(): Promise<void> {
    const id = conversationIdRef.current;
    if (!id || streamingRef.current) return;
    try {
      const result = await controlConversation(id, {
        action: "resume",
        stateVersion: stateVersionRef.current,
      });
      applyState(result.data.state, result.data.stateVersion);
    } catch (cause) {
      setError(conversationErrorMessage(cause));
    }
  }

  async function finishConversation(
    reason: "user_end" | "quiet",
  ): Promise<boolean> {
    const id = conversationIdRef.current;
    abortRef.current?.abort();
    if (!id) return true;
    try {
      const result = await endConversation(id, reason);
      applyState("end", result.data.stateVersion);
      setSuggestions([]);
      return true;
    } catch (cause) {
      if (
        isApiError(cause) &&
        (cause.code === "NOT_FOUND" || cause.code === "UNAUTHORIZED")
      ) {
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
      setDeletion(
        status.data.deletions.find(
          (item) => item.operationId === result.data.operationId,
        ) ?? null,
      );
    } catch (cause) {
      setError(conversationErrorMessage(cause));
    }
  }

  async function cancelActiveStream(): Promise<void> {
    if (!streamingRef.current) {
      abortRef.current?.abort();
      return;
    }
    await stopActiveTurn(true);
  }

  async function loadSummary(): Promise<{
    ok: boolean;
    data: ConversationSummaryData | null;
    fallback?: DemoFallbackReason;
  }> {
    const id = conversationIdRef.current;
    if (!id) return { ok: false, data: null };
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      const result = await getConversationSummary(id);
      setSummary(result.data);
      return { ok: true, data: result.data };
    } catch (cause) {
      if (isApiError(cause) && cause.code === "NOT_FOUND") {
        setSummary(null);
        return { ok: true, data: null };
      }
      if (isApiError(cause) && cause.code === "GONE") {
        applyState("end", stateVersionRef.current);
        blockedRef.current = true;
        setBlocked(true);
      }
      if (
        isLiveFallbackError(cause) &&
        isApiError(cause) &&
        cause.code === "LIVE_BUDGET_EXHAUSTED"
      ) {
        setSummaryError(summaryErrorMessage(cause));
        return { ok: false, data: null, fallback: "live_budget_exhausted" };
      }
      setSummaryError(summaryErrorMessage(cause));
      return { ok: false, data: null };
    } finally {
      setSummaryBusy(false);
    }
  }

  async function generateSummary(): Promise<{
    ok: boolean;
    fallback?: DemoFallbackReason;
    data?: ConversationSummaryData;
  }> {
    const id = conversationIdRef.current;
    if (!id) return { ok: false };
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      // 재생성은 새 Idempotency Key
      const result = await createConversationSummary(
        id,
        createIdempotencyKey(),
      );
      setSummary(result.data);
      return { ok: true, data: result.data };
    } catch (cause) {
      if (
        isLiveFallbackError(cause) &&
        isApiError(cause) &&
        cause.code === "LIVE_BUDGET_EXHAUSTED"
      ) {
        setSummaryError(summaryErrorMessage(cause));
        return { ok: false, fallback: "live_budget_exhausted" };
      }
      if (isApiError(cause) && cause.code === "GONE") {
        applyState("end", stateVersionRef.current);
        blockedRef.current = true;
        setBlocked(true);
      }
      setSummaryError(summaryErrorMessage(cause));
      return { ok: false };
    } finally {
      setSummaryBusy(false);
    }
  }

  async function openOrCreateSummary(): Promise<{
    ok: boolean;
    fallback?: DemoFallbackReason;
    data?: ConversationSummaryData;
  }> {
    const loaded = await loadSummary();
    if (!loaded.ok) return { ok: false, fallback: loaded.fallback };
    if (loaded.data) return { ok: true, data: loaded.data };
    return generateSummary();
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
    stateRef.current = "offer";
    stateVersionRef.current = 1;
    hydrateConversationId = null;
    hydratePromise = null;
    debugRef.current = { finishedReason: null, judgeStatus: null };
    setConversationId(null);
    setMode(null);
    setState("offer");
    setStateVersion(1);
    setMessages([]);
    setSuggestions([]);
    setCrisis(null);
    setStreaming(false);
    setBlocked(false);
    setError(null);
    setRetryable(false);
    setDeleted(false);
    setDeletion(null);
    setSummary(null);
    setSummaryBusy(false);
    setSummaryError(null);
    setSessionResume(null);
  }

  useEffect(() => {
    let cancelled = false;
    void bootstrapVisit().then(async (visit) => {
      if (cancelled || !visit?.activeConversationId) return;
      await restoreFromServer(visit.activeConversationId, {
        asSessionResume: true,
      });
    });
    return () => {
      cancelled = true;
      void stopActiveTurn(false);
    };
  }, [restoreFromServer, stopActiveTurn]);

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
    blocked: blocked || deleted || state === "end",
    deleted,
    deletion,
    error,
    retryable,
    summary,
    summaryBusy,
    summaryError,
    sessionResume,
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
    loadSummary,
    generateSummary,
    openOrCreateSummary,
  };
}
