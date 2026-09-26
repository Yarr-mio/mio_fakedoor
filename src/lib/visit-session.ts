import { getVisit, startVisit } from "./api/visit";
import {
  VISIT_CHANNEL_KEYS,
  type VisitChannel,
  type VisitStatusData,
} from "./api/types";
import { currentJourneyId, setEventSurface } from "./need-events";

// 방문 세션 1회
let bootPromise: Promise<VisitStatusData | null> | null = null;

function visitChannelFromLocation(): VisitChannel | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const channel: VisitChannel = {};
  for (const key of VISIT_CHANNEL_KEYS) {
    const value = params.get(key);
    if (value) channel[key] = value;
  }
  return Object.keys(channel).length > 0 ? channel : undefined;
}

export function resetVisitBootstrap(): void {
  bootPromise = null;
}

export function bootstrapVisit(): Promise<VisitStatusData | null> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    try {
      const started = await startVisit({
        journeyId: currentJourneyId(),
        channel: visitChannelFromLocation(),
      });
      setEventSurface(started.data.mode);
    } catch {
      /* 방문 시작 실패 후 상태 조회 */
    }
    try {
      const status = await getVisit();
      setEventSurface(status.data.mode);
      return status.data;
    } catch {
      return null;
    }
  })();
  return bootPromise;
}
