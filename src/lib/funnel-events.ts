/**
 * 퍼널 이벤트 화이트리스트 — mio_server의 event-whitelist.yml과 같은 철학.
 * 목록 밖 이름은 서버에서 조용히 드롭한다.
 */
export const FUNNEL_EVENT_NAMES = [
  "page_viewed", // { page }
  "test_started",
  "question_answered", // { index, question_id, option_id }
  "test_completed", // { type, duration_ms }
  "result_viewed", // { type, shared_visit }
  "share_clicked", // { type, method }
  "cta_clicked", // { type, variant, kind }
  "beta_form_opened", // { type, variant }
  "beta_submitted", // { type, variant, source }
  "beta_link_redirected", // { type }
  "fakedoor_shown", // { type }
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

export const FUNNEL_EVENT_SET: ReadonlySet<string> = new Set(FUNNEL_EVENT_NAMES);

export const MAX_BATCH_SIZE = 20;
export const MAX_PROPS_BYTES = 2048;
export const MAX_ANON_ID_LENGTH = 64;

export const VARIANTS = ["form", "link"] as const;
export type Variant = (typeof VARIANTS)[number];
