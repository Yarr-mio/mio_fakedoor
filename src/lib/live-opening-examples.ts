import { TONE_EXAMPLES } from "./chat-mock";
import type { Need } from "./need-flow";

export type LiveOpeningExample = {
  id: string;
  text: string;
};

// 시작 예시 3개
export function liveOpeningExamples(need: Need): LiveOpeningExample[] {
  const examples =
    need === "perspective"
      ? [TONE_EXAMPLES[2], TONE_EXAMPLES[1], TONE_EXAMPLES[0]]
      : [TONE_EXAMPLES[0], TONE_EXAMPLES[1], TONE_EXAMPLES[2]];
  return examples.map((example) => ({ id: example.id, text: example.user }));
}

// 전송 문장 출처 비교
export function resolveLiveDraftSource(
  draft: string,
  filled: LiveOpeningExample | null,
): { source: "typed" | "fixture"; fixtureId: string | null } {
  if (filled && draft === filled.text) {
    return { source: "fixture", fixtureId: filled.id };
  }
  return { source: "typed", fixtureId: null };
}
