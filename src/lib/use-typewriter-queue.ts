"use client";

import { useEffect, useRef, useState } from "react";

export const TYPEWRITER_BASE_MS = 35;
export const TYPEWRITER_MIN_MS = 8;
export const TYPEWRITER_BACKLOG_FULL = 80;

const CHAT_LOG_PIN_GAP_PX = 48;

export type TypewriterLine = {
  id: string;
  text: string;
  live: boolean;
};

type TypewriterOptions = {
  networkStreaming: boolean;
  cancelled: boolean;
};

type TypewriterView = {
  id: string | null;
  shown: string;
  pending: boolean;
};

const EMPTY_VIEW: TypewriterView = { id: null, shown: "", pending: false };

let graphemeSegmenter: Intl.Segmenter | null = null;

export function splitGraphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    graphemeSegmenter ??= new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    return Array.from(
      graphemeSegmenter.segment(value),
      (part) => part.segment,
    );
  }
  return Array.from(value);
}

export function typewriterDelayMs(backlog: number): number {
  const count = Math.max(0, backlog);
  if (count <= 1) return TYPEWRITER_BASE_MS;
  const ratio = Math.min(1, (count - 1) / TYPEWRITER_BACKLOG_FULL);
  return Math.round(
    TYPEWRITER_BASE_MS - (TYPEWRITER_BASE_MS - TYPEWRITER_MIN_MS) * ratio,
  );
}

function backlogOf(queue: string[][]): number {
  let count = 0;
  for (const sentence of queue) count += sentence.length;
  return count;
}

function sameView(current: TypewriterView, next: TypewriterView): boolean {
  return (
    current.id === next.id &&
    current.shown === next.shown &&
    current.pending === next.pending
  );
}

export function useTypewriterQueue(
  lines: TypewriterLine[],
  options: TypewriterOptions,
) {
  const [reduced, setReduced] = useState(false);
  const [view, setView] = useState<TypewriterView>(EMPTY_VIEW);
  const queueRef = useRef<string[][]>([]);
  const committedRef = useRef("");
  const shownRef = useRef("");
  const lockRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  const reducedRef = useRef(false);
  const cancelledRef = useRef(options.cancelled);
  const streamingRef = useRef(options.networkStreaming);
  const linesRef = useRef(lines);
  const prevStreamingRef = useRef(false);
  const newRequestRef = useRef(false);
  const hiddenRef = useRef(
    typeof document !== "undefined" && document.visibilityState === "hidden",
  );

  const live = lines.find((line) => line.live) ?? null;
  if (options.cancelled || reduced || live) newRequestRef.current = false;
  else if (options.networkStreaming && !prevStreamingRef.current)
    newRequestRef.current = true;
  prevStreamingRef.current = options.networkStreaming;
  const newRequestGap = newRequestRef.current;

  reducedRef.current = reduced;
  cancelledRef.current = options.cancelled;
  streamingRef.current = options.networkStreaming;
  linesRef.current = lines;

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function publish(next: TypewriterView) {
    shownRef.current = next.shown;
    lockRef.current = next.id;
    setView((current) => (sameView(current, next) ? current : next));
  }

  function resetLocked() {
    clearTimer();
    queueRef.current = [];
    committedRef.current = "";
    shownRef.current = "";
    lockRef.current = null;
  }

  const engineRef = useRef({
    schedule() {
      return;
    },
    ingest(_text: string) {
      return "same" as "same" | "queued" | "replaced" | "flushed";
    },
  });

  function flushHidden() {
    clearTimer();
    queueRef.current = [];
    if (!lockRef.current) return;
    shownRef.current = committedRef.current;
    publish({
      id: lockRef.current,
      shown: shownRef.current,
      pending: streamingRef.current,
    });
  }

  engineRef.current.ingest = (text: string) => {
    const committed = committedRef.current;
    if (text === committed) return "same";
    if (hiddenRef.current) {
      // 숨긴 탭의 남은 글자 즉시 표시
      clearTimer();
      queueRef.current = [];
      committedRef.current = text;
      shownRef.current = text;
      return "flushed";
    }
    if (!text.startsWith(committed)) {
      // 안전 치환 시 화면 문구 즉시 교체
      clearTimer();
      queueRef.current = [];
      committedRef.current = text;
      shownRef.current = text;
      return "replaced";
    }
    const extra = splitGraphemes(text.slice(committed.length));
    committedRef.current = text;
    if (extra.length > 0) queueRef.current.push(extra);
    return "queued";
  };

  engineRef.current.schedule = () => {
    if (timerRef.current !== null) return;
    if (!aliveRef.current) return;
    if (
      reducedRef.current ||
      cancelledRef.current ||
      newRequestRef.current ||
      hiddenRef.current
    )
      return;
    if (backlogOf(queueRef.current) === 0) return;
    const wait = typewriterDelayMs(backlogOf(queueRef.current));
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!aliveRef.current || reducedRef.current || cancelledRef.current)
        return;
      if (newRequestRef.current) return;
      if (hiddenRef.current) {
        flushHidden();
        return;
      }
      const sentence = queueRef.current[0];
      if (!sentence || sentence.length === 0) {
        if (sentence) queueRef.current.shift();
        const left = backlogOf(queueRef.current);
        publish({
          id: lockRef.current,
          shown: shownRef.current,
          pending: left > 0,
        });
        if (left > 0) engineRef.current.schedule();
        return;
      }
      const piece = sentence.shift();
      if (sentence.length === 0) queueRef.current.shift();
      if (piece) shownRef.current += piece;
      const left = backlogOf(queueRef.current);
      if (left === 0) shownRef.current = committedRef.current;
      publish({
        id: lockRef.current,
        shown: shownRef.current,
        pending: left > 0,
      });
      if (left > 0) engineRef.current.schedule();
    }, wait);
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimer();
      queueRef.current = [];
      lockRef.current = null;
      committedRef.current = "";
      shownRef.current = "";
    };
  }, []);

  useEffect(() => {
    function onVisibility() {
      const hidden = document.visibilityState === "hidden";
      hiddenRef.current = hidden;
      if (hidden) flushHidden();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const currentLive = lines.find((line) => line.live) ?? null;

    if (options.cancelled || reduced || newRequestRef.current) {
      resetLocked();
      publish(EMPTY_VIEW);
      return;
    }

    if (currentLive && lockRef.current !== currentLive.id) {
      resetLocked();
      lockRef.current = currentLive.id;
      committedRef.current = "";
      shownRef.current = "";
      const kind = engineRef.current.ingest(currentLive.text);
      const pending =
        kind === "flushed"
          ? streamingRef.current
          : kind !== "replaced" && backlogOf(queueRef.current) > 0;
      publish({
        id: currentLive.id,
        shown: shownRef.current,
        pending,
      });
      if (pending) engineRef.current.schedule();
      return;
    }

    if (!lockRef.current) return;

    const line = lines.find((item) => item.id === lockRef.current);
    if (!line) {
      resetLocked();
      publish(EMPTY_VIEW);
      return;
    }

    const kind = engineRef.current.ingest(line.text);
    if (kind === "flushed") {
      publish({
        id: lockRef.current,
        shown: shownRef.current,
        pending: streamingRef.current,
      });
      return;
    }
    if (kind === "replaced") {
      publish({
        id: lockRef.current,
        shown: shownRef.current,
        pending: false,
      });
      return;
    }
    if (
      backlogOf(queueRef.current) === 0 &&
      shownRef.current !== line.text
    ) {
      shownRef.current = line.text;
      committedRef.current = line.text;
    }
    const pending = backlogOf(queueRef.current) > 0;
    publish({ id: lockRef.current, shown: shownRef.current, pending });
    if (pending) engineRef.current.schedule();
  }, [lines, options.cancelled, options.networkStreaming, reduced]);

  const locked =
    !live || view.id === live.id
      ? (lines.find((line) => line.id === view.id) ?? null)
      : null;
  const behind = Boolean(locked && locked.text !== view.shown);
  const sameSession = !live || view.id === live.id;
  const pending =
    !options.cancelled &&
    !reduced &&
    !newRequestGap &&
    (sameSession ? view.pending || behind : live.text.length > 0);

  function reveal(id: string, text: string): string {
    if (options.cancelled || reduced || newRequestGap) return text;
    if (live && live.id !== id) return text;
    if (view.id === id) return view.shown;
    if (live?.id === id) return "";
    return text;
  }

  return {
    pending,
    shown: view.shown,
    reveal,
  };
}

export function chatLogPinned(node: HTMLElement): boolean {
  const gap = node.scrollHeight - node.scrollTop - node.clientHeight;
  return gap <= CHAT_LOG_PIN_GAP_PX;
}
