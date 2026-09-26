"use client";

import { canShowLiveObservation } from "@/lib/need-events";
import type { Screen } from "@/lib/need-flow";
import type { MockFollowUp } from "@/lib/mock-dialogue-policy";

type LiveObservationStubProps = {
  screen: Screen;
  followUp?: MockFollowUp;
};

export function LiveObservationStub({
  screen,
  followUp,
}: LiveObservationStubProps) {
  // 관찰 질문 문구 미확정
  if (!canShowLiveObservation(screen, followUp)) return null;
  return null;
}
