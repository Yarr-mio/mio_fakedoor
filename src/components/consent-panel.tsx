"use client";

import { useRef, useState } from "react";
import { Icon, Primary } from "./need-ui";
import { LegalDocument, type LegalDocumentId } from "./legal-document";
import {
  CONSENT_DOCUMENT_CODES,
  CONVERSATION_CONTENT_UNTIL_DELETION_OR_WITHDRAWAL,
  REQUIRED_CONSENT_CODES,
  type ConsentDocumentCode,
  type ConsentRetention,
  type DeletionRecord,
  type WithdrawConsentData,
} from "@/lib/api";

export type ConsentSelection = {
  age: boolean;
  terms: boolean;
  personal: boolean;
  sensitive: boolean;
  marketing: boolean;
};
export const EMPTY_CONSENT: ConsentSelection = {
  age: false,
  terms: false,
  personal: false,
  sensitive: false,
  marketing: false,
};
export const canContinue = (value: ConsentSelection) =>
  REQUIRED_CONSENT_CODES.every((code) => value[code]);
const items = [
  {
    id: "age",
    label: "만 14세 이상",
    summary: "미오는 만 14세 이상부터 이용할 수 있어요.",
  },
  {
    id: "terms",
    label: "서비스 이용약관 동의",
    summary: "서비스 이용과 관련된 권리와 의무를 확인해 주세요.",
  },
  {
    id: "personal",
    label: "개인정보 수집 및 이용 동의",
    summary: "계정 관리와 서비스 제공에 필요한 정보를 다뤄요.",
  },
  {
    id: "sensitive",
    label: "민감정보 수집 및 이용 동의",
    summary: "감정·건강 정보가 포함된 대화와 그로부터 생성된 정보를 다뤄요.",
  },
  {
    id: "marketing",
    label: "마케팅 정보 수신 동의",
    summary: "새로운 기능과 혜택을 안내해요. 동의하지 않아도 시작할 수 있어요.",
  },
] as const;

export function ConsentPanel({
  value,
  onChange,
  onContinue,
  onCancel,
  busy = false,
  error,
}: {
  value: ConsentSelection;
  onChange: (value: ConsentSelection) => void;
  onContinue: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [document, setDocument] = useState<LegalDocumentId>("terms");
  const dialog = useRef<HTMLDialogElement>(null);
  const allChecked = items.every((item) => value[item.id]);
  function open(id: LegalDocumentId) {
    setDocument(id);
    dialog.current?.showModal();
    dialog.current?.scrollTo(0, 0);
  }
  return (
    <>
      <section className="nf-consent-card" aria-labelledby="consent-heading">
        <div className="nf-consent-card-heading">
          <span className="nf-icon-tile">
            <Icon name="shield" size={22} />
          </span>
          <div>
            <p>시작을 위한 확인</p>
            <h2 id="consent-heading">내 정보, 내가 선택해요</h2>
          </div>
        </div>
        <label className="nf-consent-all">
          <input
            type="checkbox"
            checked={allChecked}
            disabled={busy}
            onChange={(event) => {
              const checked = event.target.checked;
              onChange({
                age: checked,
                terms: checked,
                personal: checked,
                sensitive: checked,
                marketing: checked,
              });
            }}
          />
          <span>
            <strong>전체 동의</strong>
            <span>
              만 14세 이상 확인과 선택 항목인 마케팅 정보 수신 동의를 포함해요.
            </span>
          </span>
        </label>
        <div className="nf-consent-rows">
          {items.map((item) => (
            <div
              className={`nf-consent-row ${item.id === "marketing" ? "nf-consent-optional" : ""}`}
              key={item.id}
            >
              <label>
                <input
                  type="checkbox"
                  checked={value[item.id]}
                  disabled={busy}
                  onChange={(e) =>
                    onChange({ ...value, [item.id]: e.target.checked })
                  }
                />
                <span>
                  <span className="nf-consent-label">
                    {item.label}{" "}
                    <small>
                      {item.id === "marketing" ? "[선택]" : "[필수]"}
                    </small>
                  </span>
                  <span className="nf-consent-summary">{item.summary}</span>
                </span>
              </label>
              {item.id !== "age" && (
                <button
                  className="nf-consent-detail-button"
                  onClick={() => open(item.id as LegalDocumentId)}
                  aria-label={`${item.label.replace("에 동의합니다.", "")} 상세보기`}
                >
                  <Icon name="arrow" size={19} />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="nf-policy-link">
          내 정보의 처리 기준은{" "}
          <button onClick={() => open("privacy")}>개인정보 처리방침</button>에서
          확인할 수 있어요.
        </p>
        {error ? (
          <p className="nf-consent-error" role="alert">
            {error}
          </p>
        ) : null}
        {/* 약관 화면 보유기간 미표시 */}
        <Primary onClick={onContinue} disabled={busy || !canContinue(value)}>
          {busy ? "동의 기록 중" : "동의하고 시작하기"}
        </Primary>
        <button className="nf-text-button" onClick={onCancel}>
          다음에 할게요
        </button>
      </section>
      <dialog
        className="nf-legal-dialog"
        ref={dialog}
        aria-label="약관 상세보기"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="nf-legal-toolbar">
          <span>Mio · 이용 문서</span>
          <button
            onClick={() => dialog.current?.close()}
            aria-label="상세보기 닫기"
          >
            <Icon name="close" size={22} />
          </button>
        </div>
        <LegalDocument document={document} />
        <div className="nf-legal-end">
          <button onClick={() => dialog.current?.close()}>
            동의 화면으로 돌아가기
          </button>
        </div>
      </dialog>
    </>
  );
}

const SUNSET_POLICY_LABELS: Record<string, string> = {
  until_purpose_ends: "이용 목적이 끝나는 때까지 보관해요",
};

function sunsetPolicyLabel(value: string): string | null {
  if (SUNSET_POLICY_LABELS[value]) return SUNSET_POLICY_LABELS[value];
  if (/^[a-z0-9_]+$/.test(value)) return null;
  return value;
}

export function ConsentRetentionNotice({
  retention,
  variant = "card",
}: {
  retention: ConsentRetention;
  variant?: "card" | "panel";
}) {
  const content =
    retention.conversationContent ===
    CONVERSATION_CONTENT_UNTIL_DELETION_OR_WITHDRAWAL
      ? "대화 원문은 삭제 요청 또는 민감정보 동의 철회 시까지 보관해요"
      : /^[a-z0-9_]+$/.test(retention.conversationContent)
        ? null
        : retention.conversationContent;
  const sunset = sunsetPolicyLabel(retention.sunsetPolicy);
  const items = (
    <ul className={variant === "panel" ? "nf-retention-list" : undefined}>
      {content ? <li>{content}</li> : null}
      <li>
        삭제 요청 후 운영 저장은 {retention.deletionDeadlineDays.database}일
        이내 백업은 {retention.deletionDeadlineDays.backup}일 이내에 지워요
      </li>
      <li>
        접속과 이용 기록은 {retention.operationalLogDays}일 보관하며 원문과
        민감정보는 넣지 않아요
      </li>
      <li>
        동의와 철회 기록은 전체 철회 또는 서비스 종료 후{" "}
        {retention.consentHistoryYears}년 보관해요
      </li>
      {sunset ? <li>{sunset}</li> : null}
    </ul>
  );
  if (variant === "panel") {
    return (
      <section className="nf-withdraw" aria-labelledby="retention-heading">
        <h2 id="retention-heading">보유 기간 안내</h2>
        {items}
      </section>
    );
  }
  return (
    <div className="nf-retention">
      <p>보유 기간 안내</p>
      {items}
    </div>
  );
}

export function ConsentRequestNotice() {
  return (
    <div className="nf-consent-request-notice" role="status">
      <p>요청이 접수되었어요.</p>
      <p>원문 없는 집계는 남을 수 있으니 참고해 주세요.</p>
    </div>
  );
}

const withdrawLabels: Record<ConsentDocumentCode, string> = {
  age: "만 14세 이상 확인",
  terms: "서비스 이용약관",
  personal: "개인정보 수집 및 이용",
  sensitive: "민감정보 수집 및 이용",
  marketing: "마케팅 정보 수신",
};

export function ConsentWithdrawPanel({
  busy,
  error,
  withdrawal,
  deletion,
  onWithdraw,
  onRetryFailed,
}: {
  busy: boolean;
  error?: string | null;
  withdrawal: WithdrawConsentData | null;
  deletion: DeletionRecord | null;
  onWithdraw: (documentCodes?: ConsentDocumentCode[]) => void;
  onRetryFailed: () => void;
}) {
  const [selected, setSelected] = useState<ConsentDocumentCode[]>([
    "sensitive",
  ]);
  const locked = busy || Boolean(withdrawal);
  function toggle(code: ConsentDocumentCode) {
    setSelected((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }
  return (
    <section className="nf-withdraw" aria-labelledby="withdraw-heading">
      <h2 id="withdraw-heading">동의 철회와 삭제 요청</h2>
      <p>
        개인정보 또는 민감정보 동의를 철회하면 대화 원문 삭제를 접수하고 진행 중
        대화는 바로 마쳐요
      </p>
      <div className="nf-withdraw-codes">
        {CONSENT_DOCUMENT_CODES.map((code) => (
          <label key={code}>
            <input
              type="checkbox"
              checked={selected.includes(code)}
              disabled={locked}
              onChange={() => toggle(code)}
            />
            {withdrawLabels[code]}
          </label>
        ))}
      </div>
      {withdrawal ? (
        <div aria-live="polite">
          <ConsentRequestNotice />
          {deletion?.status === "failed" && deletion.error ? (
            <p className="nf-consent-error">{deletion.error.message}</p>
          ) : null}
          {deletion?.status === "failed" && deletion.retryable === true ? (
            <button
              className="nf-text-button"
              disabled={busy}
              onClick={onRetryFailed}
            >
              다시 요청하기
            </button>
          ) : null}
          {deletion?.status === "failed" && deletion.retryable === false ? (
            <p>지금은 다시 요청할 수 없어요</p>
          ) : null}
        </div>
      ) : (
        <div className="nf-withdraw-actions">
          <button
            className="nf-secondary"
            disabled={locked || selected.length === 0}
            onClick={() => onWithdraw(selected)}
          >
            선택한 항목 철회
          </button>
          <button
            className="nf-text-button"
            disabled={locked}
            onClick={() => {
              setSelected([...CONSENT_DOCUMENT_CODES]);
              onWithdraw();
            }}
          >
            전체 철회
          </button>
        </div>
      )}
      {error ? (
        <p className="nf-consent-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
