import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LegalDocument, documents, type LegalDocumentId } from '@/components/legal-document';
import '../../prototype.css';

export function generateStaticParams() { return Object.keys(documents).map(document=>({document})); }
export default async function LegalPage({params}:{params:Promise<{document:string}>}) {
  const {document}=await params;
  if (!Object.hasOwn(documents,document)) notFound();
  return <div className="nf-app nf-light"><main className="nf-legal-page"><Link className="nf-legal-home" href="/">← Mio 홈으로</Link><LegalDocument document={document as LegalDocumentId}/></main></div>;
}
