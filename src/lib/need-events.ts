import {
  isMockEventName,
  isPermanentEventError,
  isPostableEventName,
  LIVE_CHANGE_RATINGS,
  LIVE_EVENT_VERSION,
  LIVE_HELP_FIT_RATINGS,
  LIVE_OBSERVATION_NAMES,
  LIVE_RECHOOSE_RATINGS,
  LIVE_UNDERSTOOD_RATINGS,
  postEvents,
  sanitizeEventProps,
  SCRIPTED_EVENT_VERSION,
  splitEventBatches,
  type FunnelEvent,
  type LiveObservationName,
} from "./api/events";
import { ApiConfigError } from "./api/config";
import type { Screen } from "./need-flow";
import type { MockFollowUp } from "./mock-dialogue-policy";
import type { ServerMode } from "./api/types";

export const NEED_EVENT_KEY = "mio_need_flow_events_v5_2";
export const EVENT_NAMES = [
  "landing_viewed",
  "entry_clicked",
  "notice_acknowledged",
  "need_selected",
  "demo_started",
  "demo_option_selected",
  "direction_changed",
  "summary_opened",
  "summary_edited",
  "summary_downloaded",
  "support_opened",
  "support_link_clicked",
  "finish_opened",
  "feedback_submitted",
  "feedback_skipped",
  "prototype_finished",
  "interest_opened",
  "mock_fixture_sent",
  "mock_input_sent",
  "mock_response_started",
  "mock_response_completed",
  "mock_response_stopped",
  "mock_response_failed",
  "mock_response_retried",
  "followup_choice",
  "interview_interest_selected",
  "interview_contact_opened",
  "scenario_selected",
  "conversation_ended_quietly",
] as const;
export type NeedEventName = (typeof EVENT_NAMES)[number];
export type NeedEvent = {
  id: string;
  journeyId: string;
  at: string;
  version: "need-flow-v5.2";
  mode: "scripted_demo";
  internal: boolean;
  name: NeedEventName;
  props: Partial<{
    screen: string;
    need: string;
    option: number;
    turn: number;
    resource: string;
    rating: string;
  }>;
};
export type EventSurface = ServerMode;
let journeyId = "";
let eventSurface: EventSurface = "scripted_demo";
const unsent: FunnelEvent[] = [];
let flushScheduled = false;
let flushing = false;
let onlineBound = false;

function readStoredUnknown(): unknown[] {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(NEED_EVENT_KEY) || "[]",
    );
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function readNeedEvents(): NeedEvent[] {
  return readStoredUnknown().filter((event): event is NeedEvent => {
    if (!event || typeof event !== "object") return false;
    const row = event as NeedEvent;
    return (
      row.version === "need-flow-v5.2" &&
      row.mode === "scripted_demo" &&
      EVENT_NAMES.includes(row.name) &&
      typeof row.journeyId === "string" &&
      typeof row.id === "string" &&
      typeof row.internal === "boolean" &&
      typeof row.props === "object" &&
      row.props !== null
    );
  });
}

export function currentJourneyId(): string {
  journeyId ||= crypto.randomUUID();
  return journeyId;
}

export function setEventSurface(surface: EventSurface): void {
  eventSurface = surface;
}

export function currentEventSurface(): EventSurface {
  return eventSurface;
}

export function canShowLiveObservation(
  screen: Screen,
  followUp?: MockFollowUp,
): boolean {
  if (followUp === "end") return false;
  return true;
}

function persistFallback(event: FunnelEvent): void {
  const stored = { ...event, props: event.props ?? {} };
  try {
    localStorage.setItem(
      NEED_EVENT_KEY,
      JSON.stringify([...readStoredUnknown(), stored].slice(-2000)),
    );
  } catch {
    /* 저장 실패 화면 유지 */
  }
}

function shouldRetryFlush(error: unknown): boolean {
  if (error instanceof ApiConfigError) return false;
  if (isPermanentEventError(error)) return false;
  return true;
}

export async function flushNeedEvents(): Promise<void> {
  if (flushing || unsent.length === 0) return;
  flushing = true;
  const batch = unsent.splice(0, unsent.length);
  try {
    for (const chunk of splitEventBatches(batch)) {
      await postEvents(chunk);
    }
  } catch (error) {
    if (shouldRetryFlush(error)) unsent.unshift(...batch);
  } finally {
    flushing = false;
  }
}

function bindOnlineFlush(): void {
  if (onlineBound) return;
  if (
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function"
  )
    return;
  onlineBound = true;
  window.addEventListener("online", () => {
    scheduleFlush();
  });
}

function scheduleFlush(): void {
  bindOnlineFlush();
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    void flushNeedEvents();
  });
}

function enqueueNewEvent(event: FunnelEvent): void {
  if (!isPostableEventName(event.name)) return;
  unsent.push(event);
  scheduleFlush();
}

function buildEvent(
  name: string,
  props: NeedEvent["props"] = {},
  options?: { version: string; mode: ServerMode },
): FunnelEvent {
  const safeProps = sanitizeEventProps(props, name);
  return {
    id: crypto.randomUUID(),
    journeyId: currentJourneyId(),
    // 기기 시계 오차 이벤트 거절 가능
    at: new Date().toISOString(),
    version:
      options?.version ??
      (eventSurface === "live" ? LIVE_EVENT_VERSION : SCRIPTED_EVENT_VERSION),
    mode: options?.mode ?? eventSurface,
    // 서버 판정 관리자 Bearer 토큰
    internal:
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("internal") === "1",
    name,
    ...(Object.keys(safeProps).length > 0 ? { props: safeProps } : {}),
  };
}

export function trackNeed(
  name: NeedEventName,
  props: NeedEvent["props"] = {},
): void {
  if (typeof window === "undefined") return;
  if (isMockEventName(name) && eventSurface === "live") return;
  try {
    const event = buildEvent(name, props);
    persistFallback(event);
    enqueueNewEvent(event);
  } catch {
    /* 계측 실패 화면 유지 */
  }
}

function liveRatingAllowed(name: LiveObservationName, rating: string): boolean {
  if (name === "live_understood")
    return (LIVE_UNDERSTOOD_RATINGS as readonly string[]).includes(rating);
  if (name === "live_help_fit")
    return (LIVE_HELP_FIT_RATINGS as readonly string[]).includes(rating);
  if (name === "live_change_reported")
    return (LIVE_CHANGE_RATINGS as readonly string[]).includes(rating);
  if (name === "live_rechoose")
    return (LIVE_RECHOOSE_RATINGS as readonly string[]).includes(rating);
  return false;
}

export function trackLiveObservation(
  name: LiveObservationName,
  rating: string,
): void {
  if (typeof window === "undefined") return;
  if (
    !LIVE_OBSERVATION_NAMES.includes(name) ||
    !liveRatingAllowed(name, rating)
  )
    return;
  try {
    const event = buildEvent(
      name,
      { rating },
      { version: LIVE_EVENT_VERSION, mode: "live" },
    );
    persistFallback(event);
    enqueueNewEvent(event);
  } catch {
    /* 계측 실패 화면 유지 */
  }
}

export function clearNeedEvents(): void {
  try {
    localStorage.removeItem(NEED_EVENT_KEY);
  } catch {
    /* UI can continue. */
  }
  journeyId = "";
  unsent.length = 0;
  eventSurface = "scripted_demo";
}

export function needMetrics(events: NeedEvent[]) {
  const journeys = (name: NeedEventName) =>
    new Set(
      events
        .filter((event) => event.name === name)
        .map((event) => event.journeyId),
    );
  const exposed = journeys("landing_viewed");
  const started = new Set(
    [...journeys("entry_clicked")].filter((id) => exposed.has(id)),
  );
  return {
    exposed: exposed.size,
    started: started.size,
    startRate: exposed.size ? started.size / exposed.size : null,
    demoJourneys: journeys("demo_started").size,
    supportJourneys: journeys("support_opened").size,
    interestJourneys: journeys("interest_opened").size,
  };
}
