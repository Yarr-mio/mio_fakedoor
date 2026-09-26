"use client";

import type { CrisisEvent } from "@/lib/api/conversations";

export function CrisisNotice({
  crisis,
  ended,
}: {
  crisis: CrisisEvent;
  ended: boolean;
}) {
  // 기관 안내 후 대화 유지 또는 종료
  return (
    <aside className="nf-crisis" role="alert">
      {crisis.fixedResponse ? <p>{crisis.fixedResponse}</p> : null}
      {crisis.emergency.length > 0 ? (
        <ul className="nf-crisis-emergency">
          {crisis.emergency.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.number}</span>
              {item.hours ? <small>{item.hours}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {crisis.resources.length > 0 ? (
        <ul className="nf-crisis-resources">
          {crisis.resources.map((item) => (
            <li key={item.id}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              <small>{item.organization}</small>
            </li>
          ))}
        </ul>
      ) : null}
      {ended && crisis.reviewRequest ? (
        <p className="nf-crisis-review">
          자동 분류로 대화가 멈춘 경우 사람 재검토를 요청할 수 있어요. 실시간
          상담사 연결은 없어요. 조회 코드 {crisis.reviewRequest.referenceCode}
          <a href={`mailto:${crisis.reviewRequest.contact}`}>재검토 문의</a>
        </p>
      ) : null}
    </aside>
  );
}
