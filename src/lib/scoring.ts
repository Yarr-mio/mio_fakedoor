/**
 * 결정적(deterministic) 스코어링 엔진.
 * mio_server의 DailyTestResultEngine과 같은 철학: 입력(답변)만으로 항상 같은 결과.
 *
 * 판정 순서:
 *  1) mask 태그 ≥ MASK_MIN 이고 소진(e) ≥ MASK_E_MIN → 가면 은하형
 *     (총점이 낮아도 '괜찮은 척' 신호가 뚜렷하면 이 유형이 서사상 정확하다)
 *  2) 총점 < LOW_TOTAL → 새벽 별형 (예방 단계)
 *  3) 최고 축 → 유형 매핑. 동률이면 e > a > r > c 우선
 *     (소진이 가장 보편적인 주호소, 다음은 행동 개입 여지가 큰 무기력 순)
 */
import { QUIZ_QUESTIONS } from "./quiz-data";
import type { BurnoutTypeId } from "./burnout-types";

export const MASK_MIN = 2;
export const MASK_E_MIN = 6;
export const LOW_TOTAL = 12;

export type Axis = "e" | "c" | "r" | "a";

/** 동률 시 우선순위 순서 */
const AXIS_PRIORITY: Axis[] = ["e", "a", "r", "c"];

const AXIS_TO_TYPE: Record<Axis, BurnoutTypeId> = {
  e: "burning-star",
  a: "drifting-comet",
  r: "foggy-nebula",
  c: "storm-planet",
};

export interface ScoringResult {
  typeId: BurnoutTypeId;
  axes: Record<Axis, number>;
  total: number;
  tags: Record<string, number>;
}

/**
 * @param answers questionId → optionId 맵. 누락된 문항/알 수 없는 옵션은 0점 처리.
 */
export function scoreAnswers(answers: Record<string, string>): ScoringResult {
  const axes: Record<Axis, number> = { e: 0, c: 0, r: 0, a: 0 };
  const tags: Record<string, number> = {};

  for (const question of QUIZ_QUESTIONS) {
    const selectedId = answers[question.id];
    if (!selectedId) continue;
    const option = question.options.find((o) => o.id === selectedId);
    if (!option) continue;

    axes.e += option.scores.e ?? 0;
    axes.c += option.scores.c ?? 0;
    axes.r += option.scores.r ?? 0;
    axes.a += option.scores.a ?? 0;
    for (const tag of option.tags ?? []) {
      tags[tag] = (tags[tag] ?? 0) + 1;
    }
  }

  const total = axes.e + axes.c + axes.r + axes.a;

  let typeId: BurnoutTypeId;
  if ((tags["mask"] ?? 0) >= MASK_MIN && axes.e >= MASK_E_MIN) {
    typeId = "masked-galaxy";
  } else if (total < LOW_TOTAL) {
    typeId = "dawn-star";
  } else {
    const dominant = AXIS_PRIORITY.reduce((best, axis) =>
      axes[axis] > axes[best] ? axis : best,
    );
    typeId = AXIS_TO_TYPE[dominant];
  }

  return { typeId, axes, total, tags };
}
