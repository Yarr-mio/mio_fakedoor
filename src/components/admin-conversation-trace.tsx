'use client';

import { useMemo, useState } from 'react';
import {
  adminErrorMessage,
  createAdminApi,
  hasAdminAccessToken,
  type AdminConversationTrace,
  type AdminTokenSource,
} from '@/lib/api/admin';

export function AdminConversationTracePanel({ tokenSource }: { tokenSource: AdminTokenSource }) {
  const api = useMemo(() => createAdminApi(tokenSource), [tokenSource]);
  const [conversationId, setConversationId] = useState('');
  const [trace, setTrace] = useState<AdminConversationTrace | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    setTrace(null);
    if (!hasAdminAccessToken(tokenSource.getAccessToken())) {
      setMessage('관리자 토큰이 없어 서버 조회를 건너뜁니다');
      return;
    }
    try {
      const result = await api.getConversation(conversationId);
      setTrace(result.data);
      setMessage('');
    } catch (error) {
      setMessage(adminErrorMessage(error, 'conversation'));
    }
  }

  return (
    <section id="conversation-trace">
      <div className="dash-section-heading">
        <span>06</span>
        <div>
          <h2>대화 판정 추적</h2>
          <p>계약 검사와 후속 확정값만 봅니다. 이 응답에는 원문이 없습니다.</p>
        </div>
      </div>
      <article className="dash-panel">
        <div className="dash-filters">
          <label>
            대화 ID
            <input value={conversationId} onChange={(e) => setConversationId(e.target.value)} />
          </label>
          <button type="button" onClick={() => void load()}>추적 불러오기</button>
        </div>
        <p className="dash-status" role="status">{message}</p>
        {!trace ? (
          <p className="dash-empty">viewer 이상 조회입니다. 원문 필드를 요청하거나 표시하지 않습니다.</p>
        ) : (
          <>
            <p>
              {trace.conversationId} · {trace.mode} · {trace.state} · 사용자 턴 {trace.userTurns} · {trace.policyVersion}
            </p>
            <div className="dash-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>메시지</th>
                    <th>responseAct</th>
                    <th>후속 모델</th>
                    <th>후속 확정</th>
                    <th>위반</th>
                    <th>지연 ms</th>
                    <th>비용</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.turns.map((turn) => (
                    <tr key={turn.messageId}>
                      <td>{turn.messageId}</td>
                      <td>{turn.responseAct}</td>
                      <td>{turn.followUpModel}</td>
                      <td>{turn.followUpFinal}</td>
                      <td>{turn.contractViolations.join(', ') || '없음'}</td>
                      <td>{turn.latencyMs}</td>
                      <td>{turn.costKrw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
