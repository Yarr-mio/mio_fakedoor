"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTypewriterQueue } from "@/lib/use-typewriter-queue";

type TypedMioTextProps = {
  id: string;
  text: string;
  live: boolean;
  networkStreaming: boolean;
  cancelled: boolean;
  onPending: (id: string, pending: boolean) => void;
  onStick: () => void;
};

export function TypedMioText({
  id,
  text,
  live,
  networkStreaming,
  cancelled,
  onPending,
  onStick,
}: TypedMioTextProps) {
  // 말풍선 내부 글자 상태 갱신
  const lines = useMemo(
    () => [{ id, text, live }],
    [id, text, live],
  );
  const typing = useTypewriterQueue(lines, { networkStreaming, cancelled });
  const visible = typing.reveal(id, text);
  const engagedRef = useRef(false);
  if (live || typing.pending || typing.shown.length > 0)
    engagedRef.current = true;

  useLayoutEffect(() => {
    onPending(id, typing.pending);
  }, [id, onPending, typing.pending]);

  useLayoutEffect(() => {
    return () => onPending(id, false);
  }, [id, onPending]);

  useEffect(() => {
    if (!engagedRef.current || !typing.shown) return;
    onStick();
  }, [onStick, typing.shown]);

  if (visible === text) return text;
  return (
    <>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
