"use client";

import { useMemo, useState } from "react";
import {
  adminErrorMessage,
  createAdminApi,
  formatJudgeStatus,
  hasAdminAccessToken,
  resolveAdminAccessToken,
  type AdminConversationTrace,
  type AdminNliLabel,
  type AdminTokenSource,
} from "@/lib/api/admin";
import { handleAdminUnauthorized } from "@/lib/admin-api-key";

const NLI_LABELS: Record<AdminNliLabel, string> = {
  entailed: "성립",
  neutral: "중립",
  contradicted: "모순",
};

export function AdminConversationTracePanel({
  tokenSource,
  onUnauthorized,
}: {
  tokenSource: AdminTokenSource;
  onUnauthorized?: (message: string) => void;
}) {
  const api = useMemo(() => createAdminApi(tokenSource), [tokenSource]);
  const [conversationId, setConversationId] = useState("");
  const [trace, setTrace] = useState<AdminConversationTrace | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setTrace(null);
    if (!hasAdminAccessToken(await resolveAdminAccessToken(tokenSource))) {
      setMessage(
        "이 탭에 접근 키가 없습니다. 다시 로그인하면 서버 조회에 그 키를 사용합니다",
      );
      return;
    }
    try {
      const result = await api.getConversation(conversationId);
      setTrace(result.data);
      setMessage("");
    } catch (error) {
      const unauthorized = handleAdminUnauthorized(error, "conversation");
      if (unauthorized !== null) {
        onUnauthorized?.(unauthorized);
        return;
      }
      setMessage(adminErrorMessage(error, "conversation"));
    }
  }

  return (
    <section id="conversation-trace">
      <div className="dash-section-heading">
        <span>06</span>
        <div>
          <h2>대화 판정 추적</h2>
          <p>
            계약 검사와 정리 판정을 봅니다. 원문은 없습니다. 삭제된 대화도 판정
            기록은 그대로 보이고, 정리가 지워졌으면 정리는 비어 있습니다.
          </p>
        </div>
      </div>
      <article className="dash-panel">
        <div className="dash-filters">
          <label>
            대화 ID
            <input
              value={conversationId}
              onChange={(e) => setConversationId(e.target.value)}
            />
          </label>
          <button type="button" onClick={() => void load()}>
            추적 불러오기
          </button>
        </div>
        <p className="dash-status" role="status">
          {message}
        </p>
        {!trace ? (
          <p className="dash-empty">
            viewer 이상 조회입니다. 원문 필드를 요청하거나 표시하지 않습니다.
          </p>
        ) : (
          <>
            <p>
              {trace.conversationId} · {trace.mode} · {trace.state} · 사용자 턴{" "}
              {trace.userTurns} · {trace.policyVersion}
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
                      <td>{turn.contractViolations.join(", ") || "없음"}</td>
                      <td>{turn.latencyMs}</td>
                      <td>{turn.costKrw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>정리 판정</h3>
            {trace.summary === null ? (
              <p className="dash-empty">정리가 없습니다.</p>
            ) : (
              <>
                <p>
                  {formatJudgeStatus(trace.summary.judgeStatus)} ·{" "}
                  {trace.summary.summaryId}
                </p>
                <p>
                  계약 위반{" "}
                  {trace.summary.contractViolations.length > 0
                    ? trace.summary.contractViolations.join(", ")
                    : "없음"}
                </p>
                <div className="dash-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>유형</th>
                        <th>값</th>
                        <th>근거 메시지</th>
                        <th>NLI</th>
                        <th>판정</th>
                        <th>채택</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.summary.attributions.map((item, index) => (
                        <tr key={`${item.evidenceMessageId}-${index}`}>
                          <td>{item.type}</td>
                          <td>{item.value}</td>
                          <td>{item.evidenceMessageId}</td>
                          <td>
                            {item.nli === null
                              ? "검사 안 됨"
                              : NLI_LABELS[item.nli]}
                          </td>
                          <td>
                            {item.judge === "accepted"
                              ? "채택 판정"
                              : item.judge === "rejected"
                                ? "거절 판정"
                                : "호출 안 함"}
                          </td>
                          <td>{item.kept ? "채택" : "버림"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </article>
    </section>
  );
}
