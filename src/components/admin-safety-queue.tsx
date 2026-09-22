'use client';

import { useMemo, useState } from 'react';
import {
  adminErrorMessage,
  applySafetyReview,
  canOpenSafetySegment,
  createAdminApi,
  formatJudgeStatus,
  formatSafetyKind,
  hasAdminAccessToken,
  type AdminRole,
  type AdminSafetyEvent,
  type AdminSafetyKind,
  type AdminSafetySegment,
  type AdminTokenSource,
} from '@/lib/api/admin';

export function AdminSafetyQueue({
  tokenSource,
  role,
  start,
  end,
}: {
  tokenSource: AdminTokenSource;
  role: AdminRole;
  start: string;
  end: string;
}) {
  const api = useMemo(() => createAdminApi(tokenSource), [tokenSource]);
  const [kind, setKind] = useState<AdminSafetyKind | ''>('');
  const [reviewed, setReviewed] = useState<'all' | 'true' | 'false'>('all');
  const [events, setEvents] = useState<AdminSafetyEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState<AdminSafetySegment | null>(null);
  const [segmentError, setSegmentError] = useState('');
  const [reviewEventId, setReviewEventId] = useState('');
  const [policyApplied, setPolicyApplied] = useState('');
  const [actionResult, setActionResult] = useState('');

  async function load(cursor?: string) {
    if (!hasAdminAccessToken(tokenSource.getAccessToken())) {
      setMessage('관리자 토큰이 없어 서버 조회를 건너뜁니다');
      return;
    }
    try {
      const result = await api.getSafetyEvents({
        start: start || undefined,
        end: end || undefined,
        kind: kind || undefined,
        reviewed: reviewed === 'all' ? undefined : reviewed === 'true',
        cursor,
      });
      setEvents((current) => (cursor ? [...current, ...result.data.events] : result.data.events));
      setNextCursor(result.data.nextCursor);
      setHasMore(result.data.hasMore);
      setMessage('');
    } catch (error) {
      setMessage(adminErrorMessage(error, 'safety'));
    }
  }

  async function openSegment(event: AdminSafetyEvent) {
    setSegment(null);
    setSegmentError('');
    if (!canOpenSafetySegment(role)) {
      setSegmentError('Safety 역할만 원문 구간에 접근할 수 있습니다');
      return;
    }
    if (!event.contentAvailable) {
      setSegmentError('원문이 서버에 없습니다');
      return;
    }
    try {
      const result = await api.getSafetyEventSegment(event.safetyEventId);
      setSegment(result.data);
      setReviewEventId(event.safetyEventId);
    } catch (error) {
      setSegmentError(adminErrorMessage(error, 'segment'));
    }
  }

  async function submitReview() {
    if (!canOpenSafetySegment(role) || !reviewEventId) return;
    try {
      const reviewedAt = new Date().toISOString();
      const result = await api.reviewSafetyEvent(reviewEventId, {
        reviewedAt,
        policyApplied,
        actionResult,
      });
      setEvents((current) => applySafetyReview(current, reviewEventId, result.data.reviewedAt));
      setMessage('재검토 결과를 기록했습니다');
    } catch (error) {
      setMessage(adminErrorMessage(error, 'review'));
    }
  }

  return (
    <section id="safety">
      <div className="dash-section-heading">
        <span>05</span>
        <div>
          <h2>안전 이벤트 검토 큐</h2>
          <p>위기와 계약 위반은 다른 지표입니다. 목록에는 원문이 없고 메타데이터만 있습니다.</p>
        </div>
      </div>
      <article className="dash-panel">
        <div className="dash-filters">
          <label>
            종류
            <select value={kind} onChange={(e) => setKind(e.target.value as AdminSafetyKind | '')}>
              <option value="">종류별 각각 표시</option>
              <option value="crisis">위기만</option>
              <option value="contract_violation">계약 위반만</option>
            </select>
          </label>
          <label>
            재검토
            <select value={reviewed} onChange={(e) => setReviewed(e.target.value as 'all' | 'true' | 'false')}>
              <option value="all">전체</option>
              <option value="false">미검토</option>
              <option value="true">검토됨</option>
            </select>
          </label>
          <button type="button" onClick={() => void load()}>목록 불러오기</button>
        </div>
        <p className="dash-status" role="status">{message}</p>
        {events.length === 0 ? (
          <p className="dash-empty">서버 목록을 아직 불러오지 않았습니다. 토큰이 없으면 호출하지 않습니다.</p>
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
                      <span className={event.kind === 'crisis' ? 'dash-kind-crisis' : 'dash-kind-contract'}>
                        {formatSafetyKind(event.kind)}
                      </span>
                    </td>
                    <td>{formatJudgeStatus(event.judgeStatus)}</td>
                    <td>{event.followUpModel} → {event.followUpFinal}{event.replaced ? ' · 교체' : ''}</td>
                    <td>
                      {event.contentAvailable ? (
                        canOpenSafetySegment(role) ? (
                          <button type="button" onClick={() => void openSegment(event)}>구간 열람</button>
                        ) : (
                          'Safety 역할만 열람'
                        )
                      ) : '원문 없음'}
                    </td>
                    <td>{event.reviewedAt ?? '미검토'}</td>
                    <td>{event.conversationId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && nextCursor && (
          <div className="dash-actions">
            <button type="button" onClick={() => void load(nextCursor)}>더 보기</button>
          </div>
        )}
        {segmentError && <p className="dash-warning">{segmentError}</p>}
        {segment && (
          <div className="dash-segment">
            <h3>원문 구간 · 신호 발화 앞뒤 1턴</h3>
            <p>추가 메시지를 이어 붙이지 않습니다. 이 구간은 캐시하지 않습니다.</p>
            <ul>
              {segment.segment.map((row) => (
                <li key={row.messageId} className={row.messageId === segment.flaggedMessageId ? 'dash-flagged' : undefined}>
                  <strong>{row.role}</strong>
                  <span>{row.createdAt}</span>
                  <p>{row.content}</p>
                </li>
              ))}
            </ul>
            {canOpenSafetySegment(role) && (
              <div className="dash-input-grid">
                <label>
                  적용 정책
                  <input value={policyApplied} onChange={(e) => setPolicyApplied(e.target.value)} />
                </label>
                <label>
                  조치 결과
                  <input value={actionResult} onChange={(e) => setActionResult(e.target.value)} />
                </label>
                <button type="button" onClick={() => void submitReview()}>재검토 기록</button>
              </div>
            )}
          </div>
        )}
      </article>
    </section>
  );
}
