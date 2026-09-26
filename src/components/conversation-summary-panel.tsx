"use client";

import type { ReactNode } from "react";
import {
  formatConversationSummaryText,
  isSummaryJudgeFailed,
  splitFormattedSummarySections,
  type ConversationSummaryData,
} from "@/lib/api/conversations";
import { Icon, Primary } from "./need-ui";

function SummarySections({ text }: { text: string }) {
  const sections = splitFormattedSummarySections(text);
  if (!sections) return <p className="nf-note-content">{text}</p>;
  return (
    <div className="nf-summary-sections">
      {sections.map((section) => (
        <section key={section.label} className="nf-summary-section">
          <h3 className="nf-summary-section-title">{section.label}</h3>
          <p>{section.body}</p>
        </section>
      ))}
    </div>
  );
}

type ConversationSummaryPanelProps = {
  title: (text: ReactNode) => ReactNode;
  summary: ConversationSummaryData | null;
  busy: boolean;
  error: string | null;
  editing: boolean;
  editDraft: string;
  dirty: boolean;
  onBack: () => void;
  onEditDraft: (value: string) => void;
  onStartEdit: (draft: string) => void;
  onApplyEdit: () => void;
  onCancelEdit: () => void;
  onRetry: () => void;
  onRegenerate: () => void;
  onDownload: (text: string) => void;
  onFinish: () => void;
};

export function ConversationSummaryPanel({
  title,
  summary,
  busy,
  error,
  editing,
  editDraft,
  dirty,
  onBack,
  onEditDraft,
  onStartEdit,
  onApplyEdit,
  onCancelEdit,
  onRetry,
  onRegenerate,
  onDownload,
  onFinish,
}: ConversationSummaryPanelProps) {
  const failed = summary ? isSummaryJudgeFailed(summary) : false;
  const displayText = dirty
    ? editDraft
    : summary
      ? formatConversationSummaryText(summary)
      : "";

  return (
    <section className="nf-panel nf-summary-panel">
      <button className="nf-back" onClick={onBack}>
        <Icon name="back" size={18} />
        대화로 돌아가기
      </button>
      <p className="nf-eyebrow">원할 때만, 이야기 정리</p>
      {title(
        <>
          꺼낸 이야기를,
          <br />
          나눠서 살펴볼까요?
        </>,
      )}
      {busy ? <p className="nf-description">정리를 준비하고 있어요.</p> : null}
      {error ? (
        <p className="nf-consent-error" role="status">
          {error}
        </p>
      ) : null}
      {error ? (
        <button
          className="nf-mock-retry"
          type="button"
          onClick={onRetry}
          disabled={busy}
        >
          다시 시도
        </button>
      ) : null}
      {failed && !editing ? (
        <article className="nf-note-paper">
          <p>정리를 만들지 못했어요</p>
          <button
            className="nf-mock-retry"
            type="button"
            onClick={onRetry}
            disabled={busy}
          >
            다시 시도
          </button>
        </article>
      ) : null}
      {summary && !failed && editing ? (
        <article className="nf-note-paper">
          <label className="nf-edit-label" htmlFor="api-note">
            정리 수정
          </label>
          <textarea
            id="api-note"
            value={editDraft}
            onChange={(event) => onEditDraft(event.target.value)}
            maxLength={6000}
            rows={12}
          />
          <div className="nf-inline-actions">
            <button type="button" onClick={onApplyEdit}>
              수정 적용
            </button>
            <button type="button" onClick={onCancelEdit}>
              취소
            </button>
          </div>
        </article>
      ) : null}
      {summary && !failed && !editing && dirty ? (
        <article className="nf-note-paper">
          <div className="nf-note-title">
            <Icon name="note" size={18} />
            <h2>내가 수정한 정리</h2>
          </div>
          <SummarySections text={editDraft} />
        </article>
      ) : null}
      {summary && !failed && !editing && !dirty ? (
        <article className="nf-note-paper">
          <div className="nf-note-title">
            <Icon name="note" size={18} />
            <h2>이야기 정리</h2>
            {summary.source === "model" ? (
              <small className="nf-ai-badge">AI 생성</small>
            ) : null}
          </div>
          <SummarySections text={formatConversationSummaryText(summary)} />
        </article>
      ) : null}
      {summary && !failed && !editing ? (
        <div className="nf-summary-actions">
          <button type="button" onClick={() => onStartEdit(displayText)}>
            <Icon name="edit" size={17} />
            내가 수정하기
          </button>
          <button type="button" onClick={onRegenerate} disabled={busy}>
            다시 정리하기
          </button>
        </div>
      ) : null}
      <p className="nf-fine">
        수정은 현재 화면에만 남고 서버에는 저장되지 않아요. 내려받은 파일은
        기기에 남아요.
      </p>
      <Primary
        onClick={() => onDownload(dirty ? editDraft : displayText)}
        disabled={editing || busy || failed || !displayText.trim()}
        icon="download"
      >
        이 정리를 파일로 받기
      </Primary>
      <button className="nf-text-button" type="button" onClick={onFinish}>
        저장하지 않고 마무리하기
      </button>
    </section>
  );
}
