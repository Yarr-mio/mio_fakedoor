"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_QUESTIONS, QUESTION_COUNT } from "@/lib/quiz-data";
import { scoreAnswers } from "@/lib/scoring";
import { captureUtm, track } from "@/lib/funnel-client";

export default function TestPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    captureUtm();
    track("page_viewed", { page: "test" });
    track("test_started");
    startedAt.current = Date.now();
  }, []);

  const question = QUIZ_QUESTIONS[index];
  const progress = useMemo(
    () => Math.round(((index + 1) / QUESTION_COUNT) * 100),
    [index],
  );

  function selectOption(optionId: string) {
    if (finishing) return;

    const nextAnswers = { ...answers, [question.id]: optionId };
    setAnswers(nextAnswers);
    track("question_answered", {
      index: index + 1,
      question_id: question.id,
      option_id: optionId,
    });

    if (index + 1 < QUESTION_COUNT) {
      setIndex(index + 1);
      return;
    }

    // 마지막 문항 — 채점 후 결과로 이동
    setFinishing(true);
    const result = scoreAnswers(nextAnswers);
    track("test_completed", {
      type: result.typeId,
      duration_ms: Date.now() - startedAt.current,
    });
    router.push(`/result/${result.typeId}?d=1`);
  }

  function goBack() {
    if (index === 0) {
      router.push("/");
      return;
    }
    setIndex(index - 1);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-6">
      {/* 상단 내비게이션 + 프로그레스 */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="이전으로"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-ink-300 transition hover:bg-white/[0.1]"
        >
          ←
        </button>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={QUESTION_COUNT}
        >
          <div
            className="h-full rounded-full bg-mio-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-ink-500">
          {index + 1}/{QUESTION_COUNT}
        </span>
      </div>

      {/* 문항 */}
      <div key={question.id} className="fade-up mt-10 flex flex-1 flex-col">
        <h1 className="whitespace-pre-line text-[1.45rem] font-bold leading-snug">
          {question.text}
        </h1>

        <div className="mt-8 flex flex-col gap-3">
          {question.options.map((option) => {
            const selected = answers[question.id] === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectOption(option.id)}
                disabled={finishing}
                className={`rounded-2xl border px-5 py-4 text-left text-[0.92rem] leading-relaxed transition active:scale-[0.99] ${
                  selected
                    ? "border-mio-500 bg-mio-500/15 text-ink-100"
                    : "border-white/10 bg-white/[0.04] text-ink-300 hover:border-mio-500/50 hover:bg-white/[0.07]"
                }`}
              >
                {option.text}
              </button>
            );
          })}
        </div>
      </div>

      {finishing && (
        <p className="mt-8 text-center text-sm text-ink-400">
          당신의 마음 궤도를 계산하는 중… ✨
        </p>
      )}
    </main>
  );
}
