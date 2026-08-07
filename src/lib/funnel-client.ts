"use client";

/**
 * 클라이언트 트래킹: 익명 ID · A/B variant 배정 · 첫 유입 UTM 보존 · 이벤트 발송.
 * 전부 localStorage 기반이라 로그인이 없다 (멘토링 조언: "로그인 없으면 좋다").
 */
import type { FunnelEventName, Variant } from "./funnel-events";
import { VARIANTS } from "./funnel-events";

const ANON_KEY = "mio_funnel_anon";
const VARIANT_KEY = "mio_funnel_variant";
const UTM_KEY = "mio_funnel_utm";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAnonId(): string {
  const storage = safeStorage();
  if (!storage) return "server";
  let id = storage.getItem(ANON_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    storage.setItem(ANON_KEY, id);
  }
  return id;
}

/**
 * A/B variant. 최초 방문 시 50/50 배정 후 고정.
 * QA용 URL 오버라이드: ?v=form | ?v=link
 */
export function getVariant(): Variant {
  const storage = safeStorage();
  if (!storage) return "form";

  if (typeof window !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("v");
    if (override && (VARIANTS as readonly string[]).includes(override)) {
      storage.setItem(VARIANT_KEY, override);
      return override as Variant;
    }
  }

  let variant = storage.getItem(VARIANT_KEY);
  if (!variant || !(VARIANTS as readonly string[]).includes(variant)) {
    variant = Math.random() < 0.5 ? "form" : "link";
    storage.setItem(VARIANT_KEY, variant);
  }
  return variant as Variant;
}

/** 첫 유입(first-touch) UTM만 보존한다 — 채널별 전환 비교용 */
export function captureUtm(): Record<string, string> {
  const storage = safeStorage();
  if (!storage || typeof window === "undefined") return {};

  const existing = storage.getItem(UTM_KEY);
  if (existing) {
    try {
      return JSON.parse(existing) as Record<string, string>;
    } catch {
      storage.removeItem(UTM_KEY);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const value = params.get(key);
    if (value) utm[key] = value.slice(0, 128);
  }
  if (document.referrer) utm.referrer = document.referrer.slice(0, 256);

  if (Object.keys(utm).length > 0) {
    storage.setItem(UTM_KEY, JSON.stringify(utm));
  }
  return utm;
}

export function getUtm(): Record<string, string> {
  const storage = safeStorage();
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem(UTM_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** fire-and-forget 이벤트 발송. 실패해도 UX를 막지 않는다. */
export function track(name: FunnelEventName, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      anonId: getAnonId(),
      variant: getVariant(),
      utm: getUtm(),
      events: [{ name, props }],
    });
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 트래킹 실패는 조용히 무시
  }
}
