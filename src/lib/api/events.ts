import { optionalAdminAuthorization } from "@/lib/admin-api-key";
import { apiRequest } from "./client";
import { ApiError } from "./errors";
import {
  EVENT_PROP_KEYS,
  isJsonRecord,
  type ApiSuccess,
  type EventPropKey,
  type ServerMode,
} from "./types";

export const EVENTS_BATCH_MAX = 100;
export const EVENTS_BODY_MAX_BYTES = 1048576;
export const SCRIPTED_EVENT_VERSION = "need-flow-v5.2";
export const LIVE_EVENT_VERSION = "need-flow-v6-live";

export const LIVE_OBSERVATION_NAMES = [
  "live_understood",
  "live_help_fit",
  "live_change_reported",
  "live_rechoose",
] as const;
export type LiveObservationName = (typeof LIVE_OBSERVATION_NAMES)[number];

export const LIVE_UNDERSTOOD_RATINGS = [
  "yes",
  "partly",
  "no",
  "unsure",
] as const;
export const LIVE_HELP_FIT_RATINGS = [
  "helped",
  "partial",
  "none",
  "worse",
  "unsure",
] as const;
export const LIVE_CHANGE_RATINGS = [
  "feeling",
  "understanding",
  "intention",
  "action",
  "nothing",
] as const;
export const LIVE_RECHOOSE_RATINGS = [
  "mio",
  "other_ai",
  "memo",
  "people",
  "professional",
  "unsure",
] as const;

export type FunnelEventProps = Partial<Record<EventPropKey, string | number>>;

export type FunnelEvent = {
  id: string;
  journeyId: string;
  at: string;
  version: string;
  mode: ServerMode;
  internal: boolean;
  name: string;
  props?: FunnelEventProps;
};

export type PostEventsData = {
  accepted: number;
  duplicated: number;
  rejected: number;
  // 제거된 props 키 개수
  propsStripped: number;
};

export const EVENT_PROP_TOKEN = /^[a-z0-9_-]{1,64}$/;
export const EVENT_PROP_INT_MIN = 0;
export const EVENT_PROP_INT_MAX = 10000;

export const FOLLOWUP_CHOICE_RATINGS = [
  "perspective",
  "existing",
  "none",
] as const;
export const SUMMARY_OPENED_RATINGS = [
  "selected_fixtures",
  "default_sample",
] as const;
export const FEEDBACK_SUBMITTED_RATINGS = [
  "easy",
  "unknown",
  "difficult",
] as const;

export const EVENT_RATING_VALUES: Partial<Record<string, readonly string[]>> = {
  followup_choice: FOLLOWUP_CHOICE_RATINGS,
  summary_opened: SUMMARY_OPENED_RATINGS,
  feedback_submitted: FEEDBACK_SUBMITTED_RATINGS,
  live_understood: LIVE_UNDERSTOOD_RATINGS,
  live_help_fit: LIVE_HELP_FIT_RATINGS,
  live_change_reported: LIVE_CHANGE_RATINGS,
  live_rechoose: LIVE_RECHOOSE_RATINGS,
};

function isPropToken(value: unknown): value is string {
  return typeof value === "string" && EVENT_PROP_TOKEN.test(value);
}

function isPropInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= EVENT_PROP_INT_MIN &&
    value <= EVENT_PROP_INT_MAX
  );
}

function ratingAllowed(name: string | undefined, rating: string): boolean {
  if (!name) return true;
  const allowed = EVENT_RATING_VALUES[name];
  if (!allowed) return true;
  return (allowed as readonly string[]).includes(rating);
}

export const POSTABLE_EVENT_NAMES = [
  "landing_viewed",
  "entry_clicked",
  "notice_acknowledged",
  "need_selected",
  "demo_started",
  "scenario_selected",
  "mock_fixture_sent",
  "mock_input_sent",
  "mock_response_started",
  "mock_response_completed",
  "mock_response_stopped",
  "mock_response_failed",
  "mock_response_retried",
  "followup_choice",
  "direction_changed",
  "conversation_ended_quietly",
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
  "interview_interest_selected",
  "interview_contact_opened",
  ...LIVE_OBSERVATION_NAMES,
] as const;
export type PostableEventName = (typeof POSTABLE_EVENT_NAMES)[number];

export function isMockEventName(name: string): boolean {
  return name.startsWith("mock_");
}

export function isLiveObservationName(
  name: string,
): name is LiveObservationName {
  return (LIVE_OBSERVATION_NAMES as readonly string[]).includes(name);
}

export function isPostableEventName(name: string): name is PostableEventName {
  return (POSTABLE_EVENT_NAMES as readonly string[]).includes(name);
}

export function sanitizeEventProps(
  props: Record<string, unknown> | FunnelEventProps = {},
  name?: string,
): FunnelEventProps {
  const allowed = new Set<string>(EVENT_PROP_KEYS);
  const safe: FunnelEventProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (!allowed.has(key)) continue;
    if (key === "option" || key === "turn") {
      if (isPropInt(value)) safe[key] = value;
      continue;
    }
    if (!isPropToken(value)) continue;
    if (key === "rating" && !ratingAllowed(name, value)) continue;
    safe[key as EventPropKey] = value;
  }
  return safe;
}

function parseCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError({
      code: "UNKNOWN",
      message: `이벤트 응답 필드 오류 ${field}`,
    });
  }
  return value;
}

function parsePostEventsData(value: unknown): PostEventsData {
  if (!isJsonRecord(value)) {
    throw new ApiError({
      code: "UNKNOWN",
      message: "이벤트 응답 필드 오류 data",
    });
  }
  return {
    accepted: parseCount(value.accepted, "accepted"),
    duplicated: parseCount(value.duplicated, "duplicated"),
    rejected: parseCount(value.rejected, "rejected"),
    propsStripped: parseCount(value.propsStripped, "propsStripped"),
  };
}

function eventBodyBytes(events: FunnelEvent[]): number {
  return new TextEncoder().encode(JSON.stringify({ events })).length;
}

export function splitEventBatches(events: FunnelEvent[]): FunnelEvent[][] {
  const batches: FunnelEvent[][] = [];
  let current: FunnelEvent[] = [];
  for (const event of events) {
    const next = [...current, event];
    if (
      next.length > EVENTS_BATCH_MAX ||
      eventBodyBytes(next) > EVENTS_BODY_MAX_BYTES
    ) {
      if (current.length === 0) continue;
      batches.push(current);
      current = [event];
      continue;
    }
    current = next;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const PERMANENT_EVENT_ERROR_CODES = new Set([
  "VALIDATION_ERROR",
  "ORIGIN_MISMATCH",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
]);

export function isPermanentEventError(error: unknown): boolean {
  return (
    error instanceof ApiError && PERMANENT_EVENT_ERROR_CODES.has(error.code)
  );
}

export async function postEvents(
  events: FunnelEvent[],
): Promise<ApiSuccess<PostEventsData>> {
  // 수집 비동기 keepalive
  if (!Array.isArray(events) || events.length === 0) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: "events 배열 아님",
    });
  }
  if (events.length > EVENTS_BATCH_MAX) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: "events 100건 초과",
    });
  }
  if (eventBodyBytes(events) > EVENTS_BODY_MAX_BYTES) {
    throw new ApiError({
      code: "PAYLOAD_TOO_LARGE",
      message: "본문 크기 초과",
    });
  }
  const result = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/events",
    body: { events },
    keepalive: true,
    authorization: optionalAdminAuthorization(),
  });
  return {
    ...result,
    data: parsePostEventsData(result.data),
  };
}
