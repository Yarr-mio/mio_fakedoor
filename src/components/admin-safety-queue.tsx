"use client";

import { useMemo, useState } from "react";
import {
  adminErrorMessage,
  applySafetyReview,
  createAdminApi,
  formatJudgeStatus,
  formatSafetyKind,
  hasAdminAccessToken,
  resolveAdminAccessToken,
  type AdminReviewAction,
  type AdminReviewNoteCode,
  type AdminSafetyEvent,
  type AdminSafetyKind,
  type AdminSafetyReviewResult,
  type AdminSafetySegment,
  type AdminTokenSource,
} from "@/lib/api/admin";
import { handleAdminUnauthorized } from "@/lib/admin-api-key";

// 원문 구간과 재검토 화면 활성 여부
export const SAFETY_SEGMENT_REVIEW_ENABLED: boolean = false;

const REVIEW_ACTION_LABELS: Record<AdminReviewAction, string> = {
  confirmed: "실제 위기",
  false_positive: "오탐",
  no_action: "조치 없음",
};

const REVIEW_NOTE_LABELS: Record<AdminReviewNoteCode, string> = {
  context_misread: "맥락 오독",
  keyword_bypass: "변형 표기 우회",
  user_requested_review: "이용자 재검토 요청",
  pattern_update_needed: "패턴 갱신 필요",
  other: "기타",
};

export function AdminSafetyQueue({
  tokenSource,
  start,
  end,
  onUnauthorized,
}: {
  tokenSource: AdminTokenSource;
  start: string;
  end: string;
  onUnauthorized?: (message: string) => void;
}) {
  const api = useMemo(() => createAdminApi(tokenSource), [tokenSource]);
  const [kind, setKind] = useState<AdminSafetyKind | "">("");
  const [reviewed, setReviewed] = useState<"all" | "true" | "false">("all");
  const [events, setEvents] = useState<AdminSafetyEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<AdminSafetySegment | null>(null);
  const [segmentError, setSegmentError] = useState("");
  const [reviewEventId, setReviewEventId] = useState("");
  const [action, setAction] = useState<AdminReviewAction | "">("");
  const [noteCode, setNoteCode] = useState<AdminReviewNoteCode | "">("");
  const [reviewResult, setReviewResult] =
    useState<AdminSafetyReviewResult | null>(null);

  function report(
    error: unknown,
    context: "safety" | "segment" | "review",
  ): string | null {
    const unauthorized = handleAdminUnauthorized(error, context);
    if (unauthorized !== null) {
      onUnauthorized?.(unauthorized);
      return null;
    }
    return adminErrorMessage(error, context);
  }

  async function load(cursor?: string) {
    if (!hasAdminAccessToken(await resolveAdminAccessToken(tokenSource))) {
      setMessage(
        "이 탭에 접근 키가 없습니다. 다시 로그인하면 서버 조회에 그 키를 사용합니다",
      );
      return;
    }
    try {
      const result = await api.getSafetyEvents({
        start: start || undefined,
        end: end || undefined,
        kind: kind || undefined,
        reviewed: reviewed === "all" ? undefined : reviewed === "true",
        cursor,
      });
      setEvents((current) =>
        cursor ? [...current, ...result.data.events] : result.data.events,
      );
      setNextCursor(result.data.nextCursor);
      setHasMore(result.data.hasMore);
      setMessage("");
    } catch (error) {
      const next = report(error, "safety");
      if (next !== null) setMessage(next);
    }
  }

  async function openSegment(event: AdminSafetyEvent) {
    if (!SAFETY_SEGMENT_REVIEW_ENABLED) return;
    setSegment(null);
    setSegmentError("");
    setReviewResult(null);
    if (event.kind !== "crisis") return;
    if (!event.contentAvailable) {
      setSegmentError("원문이 서버에 없습니다");
      return;
    }
    if (!hasAdminAccessToken(await resolveAdminAccessToken(tokenSource))) {
      setSegmentError(
        "이 탭에 접근 키가 없습니다. 다시 로그인하면 서버 조회에 그 키를 사용합니다",
      );
      return;
    }
    try {
      const result = await api.getSafetyEventSegment(event.safetyEventId);
      setSegment(result.data);
      setReviewEventId(event.safetyEventId);
    } catch (error) {
      const next = report(error, "segment");
      if (next !== null) setSegmentError(next);
    }
  }

  async function submitReview() {
    if (!SAFETY_SEGMENT_REVIEW_ENABLED) return;
    if (!reviewEventId || !action) return;
    if (!hasAdminAccessToken(await resolveAdminAccessToken(tokenSource))) {
      setMessage(
        "이 탭에 접근 키가 없습니다. 다시 로그인하면 서버 조회에 그 키를 사용합니다",
      );
      return;
    }
    try {
      const result = await api.reviewSafetyEvent(reviewEventId, {
        action,
        ...(noteCode ? { noteCode } : {}),
      });
      setReviewResult(result.data);
      setEvents((current) =>
        applySafetyReview(current, reviewEventId, result.data.reviewedAt),
      );
      setMessage("재검토 결과를 기록했습니다");
    } catch (error) {
      const next = report(error, "review");
      if (next !== null) setMessage(next);
    }
  }

  return (
    <section id="safety">
      <div className="dash-section-heading">
        <span>05</span>
        <div>
          <h2>안전 이벤트 검토 큐</h2>
          <p>
            사후 목록입니다. 상담사 인계가 아니고, 위기와 계약 위반을 합쳐
            피해율로 보지 않습니다. 목록에는 원문이 없습니다.
          </p>
        </div>
      </div>
      <article className="dash-panel">
        <div className="dash-filters">
          <label>
            종류
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AdminSafetyKind | "")}
            >
              <option value="">종류별 각각 표시</option>
              <option value="crisis">위기만</option>
              <option value="contract_violation">계약 위반만</option>
            </select>
          </label>
          <label>
            재검토
            <select
              value={reviewed}
              onChange={(e) =>
                setReviewed(e.target.value as "all" | "true" | "false")
              }
            >
              <option value="all">전체</option>
              <option value="false">미검토</option>
              <option value="true">검토됨</option>
            </select>
          </label>
          <button type="button" onClick={() => void load()}>
            목록 불러오기
          </button>
        </div>
        <p className="dash-status" role="status">
          {message}
        </p>
        {SAFETY_SEGMENT_REVIEW_ENABLED ? null : (
          <p>
            원문 구간과 재검토는 Safety 권한 키가 설정되지 않아 사용할 수
            없습니다
          </p>
        )}
        {events.length === 0 ? (
          <p className="dash-empty">
            서버 목록을 아직 불러오지 않았습니다. 토큰이 없으면 호출하지
            않습니다.
          </p>
        ) : (
          <div className="dash-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>시각</th>
                  <th>종류</th>
                  <th>판정</th>
                  <th>후속</th>
                  <th>원문</th>
                  <th>재검토</th>
                  <th>대화</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.safetyEventId}>
                    <td>{event.occurredAt}</td>
                    <td>
                      <span
                        className={
                          event.kind === "crisis"
                            ? "dash-kind-crisis"
                            : "dash-kind-contract"
                        }
                      >
                        {formatSafetyKind(event.kind)}
                      </span>
                    </td>
                    <td>{formatJudgeStatus(event.judgeStatus)}</td>
                    <td>
                      {event.followUpModel} → {event.followUpFinal}
                      {event.replaced ? " · 교체" : ""}
                    </td>
                    <td>
                      {event.kind !== "crisis"
                        ? "원문 구간 없음"
                        : event.contentAvailable
                          ? SAFETY_SEGMENT_REVIEW_ENABLED
                            ? (
                              <button
                                type="button"
                                onClick={() => void openSegment(event)}
                              >
                                구간 열람
                              </button>
                            )
                            : "원문 있음"
                          : "원문 없음"}
                    </td>
                    <td>{event.reviewedAt ?? "미검토"}</td>
                    <td>{event.conversationId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && nextCursor && (
          <div className="dash-actions">
            <button type="button" onClick={() => void load(nextCursor)}>
              더 보기
            </button>
          </div>
        )}
        {SAFETY_SEGMENT_REVIEW_ENABLED && segmentError && (
          <p className="dash-warning">{segmentError}</p>
        )}
        {SAFETY_SEGMENT_REVIEW_ENABLED && segment && (
          <div className="dash-segment">
            <h3>원문 구간 · 신호 발화 앞뒤 1턴</h3>
            <p>
              추가 메시지를 이어 붙이지 않습니다. 이 구간은 캐시하지 않습니다.
            </p>
            <ul>
              {segment.segment.map((row) => (
                <li
                  key={row.messageId}
                  className={
                    row.messageId === segment.flaggedMessageId
                      ? "dash-flagged"
                      : undefined
                  }
                >
                  <strong>{row.role}</strong>
                  <span>{row.createdAt}</span>
                  <p>{row.content}</p>
                </li>
              ))}
            </ul>
            <div className="dash-input-grid">
              <label>
                조치
                <select
                  value={action}
                  onChange={(e) =>
                    setAction(e.target.value as AdminReviewAction | "")
                  }
                >
                  <option value="">선택</option>
                  {(
                    Object.keys(REVIEW_ACTION_LABELS) as AdminReviewAction[]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {REVIEW_ACTION_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                메모 코드
                <select
                  value={noteCode}
                  onChange={(e) =>
                    setNoteCode(e.target.value as AdminReviewNoteCode | "")
                  }
                >
                  <option value="">없음</option>
                  {(
                    Object.keys(REVIEW_NOTE_LABELS) as AdminReviewNoteCode[]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {REVIEW_NOTE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!action}
                onClick={() => void submitReview()}
              >
                재검토 기록
              </button>
            </div>
            {reviewResult && (
              <p>
                기록 시각 {reviewResult.reviewedAt}
                <br />
                조치 {REVIEW_ACTION_LABELS[reviewResult.action]}
                <br />
                보관 기한 {reviewResult.retainUntil}
              </p>
            )}
          </div>
        )}
      </article>
    </section>
  );
}
