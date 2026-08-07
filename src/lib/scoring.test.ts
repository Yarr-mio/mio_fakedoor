import { describe, expect, it } from "vitest";
import { QUIZ_QUESTIONS, QUESTION_COUNT } from "./quiz-data";
import { ALL_TYPE_IDS, BURNOUT_TYPES } from "./burnout-types";
import { CHARACTERS } from "./characters";
import { LOW_TOTAL, scoreAnswers, type Axis } from "./scoring";

/**
 * 각 문항에서 특정 축 점수가 가장 높은 선택지를 고른 답변 세트.
 * excludeTag가 주어지면 해당 태그가 붙은 선택지는 피한다
 * (e 축은 mask 태그와 겹치므로, 순수 소진 우세를 만들 때 사용).
 */
function pickDominant(axis: Axis, excludeTag?: string): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of QUIZ_QUESTIONS) {
    const candidates = excludeTag
      ? q.options.filter((o) => !(o.tags ?? []).includes(excludeTag))
      : q.options;
    const best = [...candidates].sort(
      (x, y) => (y.scores[axis] ?? 0) - (x.scores[axis] ?? 0),
    )[0];
    answers[q.id] = best.id;
  }
  return answers;
}

/** 모든 문항에서 총점이 가장 낮은 선택지를 고른 답변 세트 */
function pickHealthiest(): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of QUIZ_QUESTIONS) {
    const best = [...q.options].sort((x, y) => sum(x.scores) - sum(y.scores))[0];
    answers[q.id] = best.id;
  }
  return answers;
}

function sum(scores: { e?: number; c?: number; r?: number; a?: number }) {
  return (scores.e ?? 0) + (scores.c ?? 0) + (scores.r ?? 0) + (scores.a ?? 0);
}

describe("quiz data integrity", () => {
  it("has 12 questions, each with 4 options and unique ids", () => {
    expect(QUESTION_COUNT).toBe(12);
    const questionIds = new Set(QUIZ_QUESTIONS.map((q) => q.id));
    expect(questionIds.size).toBe(12);
    for (const q of QUIZ_QUESTIONS) {
      expect(q.options).toHaveLength(4);
      const optionIds = new Set(q.options.map((o) => o.id));
      expect(optionIds.size).toBe(4);
    }
  });

  it("maps every burnout type to an existing character", () => {
    for (const id of ALL_TYPE_IDS) {
      const type = BURNOUT_TYPES[id];
      expect(CHARACTERS[type.characterId]).toBeDefined();
    }
  });

  it("uses all five characters across type recommendations", () => {
    const used = new Set(ALL_TYPE_IDS.map((id) => BURNOUT_TYPES[id].characterId));
    expect(used.size).toBe(5);
  });
});

describe("scoreAnswers", () => {
  it("returns dawn-star for the healthiest answer set", () => {
    const result = scoreAnswers(pickHealthiest());
    expect(result.total).toBeLessThan(LOW_TOTAL);
    expect(result.typeId).toBe("dawn-star");
  });

  it.each([
    ["e", "burning-star"],
    ["a", "drifting-comet"],
    ["r", "foggy-nebula"],
    ["c", "storm-planet"],
  ] as const)("returns the mapped type when axis %s dominates", (axis, expected) => {
    // e 축 우세 세트는 mask 태그 선택지를 피해서 구성한다 —
    // mask ≥ 2 + 높은 e는 의도적으로 masked-galaxy가 우선하기 때문.
    const result = scoreAnswers(pickDominant(axis, axis === "e" ? "mask" : undefined));
    expect(result.typeId).toBe(expected);
  });

  it("prioritizes masked-galaxy over burning-star when max-e answers include mask options", () => {
    const result = scoreAnswers(pickDominant("e"));
    expect(result.tags["mask"]).toBeGreaterThanOrEqual(2);
    expect(result.typeId).toBe("masked-galaxy");
  });

  it("returns masked-galaxy when mask signals are present even with a low total", () => {
    // '괜찮은 척' 신호 3개(q3a, q6b, q10a)만 고르고 나머지는 가장 건강한 선택지.
    const answers = pickHealthiest();
    answers["q3"] = "q3a";
    answers["q6"] = "q6b";
    answers["q10"] = "q10a";
    const result = scoreAnswers(answers);
    expect(result.tags["mask"]).toBe(3);
    expect(result.typeId).toBe("masked-galaxy");
  });

  it("does not return masked-galaxy when mask count is below threshold", () => {
    const answers = pickHealthiest();
    answers["q3"] = "q3a"; // mask 1개
    const result = scoreAnswers(answers);
    expect(result.typeId).not.toBe("masked-galaxy");
  });

  it("breaks an exact e/a tie in favor of e (burning-star)", () => {
    // e = q1a(3) + q5a(3) = 6 / a = q4c(2) + q6c(2) + q10b(2) = 6 / total = 12 (≥ LOW_TOTAL)
    const answers: Record<string, string> = {
      q1: "q1a",
      q5: "q5a",
      q4: "q4c",
      q6: "q6c",
      q10: "q10b",
    };
    const result = scoreAnswers(answers);
    expect(result.axes.e).toBe(6);
    expect(result.axes.a).toBe(6);
    expect(result.total).toBe(12);
    expect(result.typeId).toBe("burning-star");
  });

  it("breaks an exact r/c tie in favor of r (foggy-nebula)", () => {
    // r = q4a(3) + q8a(3) = 6 / c = q6a(3) + q7a(3) = 6 / total = 12
    const answers: Record<string, string> = {
      q4: "q4a",
      q8: "q8a",
      q6: "q6a",
      q7: "q7a",
    };
    const result = scoreAnswers(answers);
    expect(result.axes.r).toBe(6);
    expect(result.axes.c).toBe(6);
    expect(result.typeId).toBe("foggy-nebula");
  });

  it("tolerates missing and unknown answers", () => {
    expect(scoreAnswers({}).typeId).toBe("dawn-star");
    expect(scoreAnswers({ q1: "nope", zz: "q1a" }).typeId).toBe("dawn-star");
  });

  it("reaches every one of the six types", () => {
    const reached = new Set([
      scoreAnswers(pickHealthiest()).typeId,
      scoreAnswers(pickDominant("e", "mask")).typeId,
      scoreAnswers(pickDominant("a")).typeId,
      scoreAnswers(pickDominant("r")).typeId,
      scoreAnswers(pickDominant("c")).typeId,
      (() => {
        const a = pickHealthiest();
        a["q3"] = "q3a";
        a["q6"] = "q6b";
        a["q10"] = "q10a";
        return scoreAnswers(a).typeId;
      })(),
    ]);
    expect(reached.size).toBe(6);
  });
});
