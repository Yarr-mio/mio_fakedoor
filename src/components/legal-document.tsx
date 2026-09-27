import documents from '@/lib/legal-documents.json';

export type LegalDocumentId = keyof typeof documents;
export { documents };

export function LegalDocument({ document }: { document: LegalDocumentId }) {
  const content = documents[document];
  return <article className="nf-legal-body">
    <p className="nf-legal-version">서비스 문서 · v1.1</p>
    <h2>{content.title}</h2>
    <p className="nf-legal-context">정식 서비스 기준 문서입니다. 현재 미리보기에서는 계정 생성·실제 AI 처리·마케팅 발송이 이루어지지 않습니다.</p>
    {content.blocks.map((block, i) => {
      if (block.kind === 'heading' && 'text' in block) return <h3 key={i}>{block.text}</h3>;
      if ('lines' in block && block.lines) return <div className="nf-legal-list" key={i}>{block.lines.map((line, j) => <p key={j}>{line}</p>)}</div>;
      return <p key={i}>{'text' in block ? block.text : ''}</p>;
    })}
  </article>;
}
