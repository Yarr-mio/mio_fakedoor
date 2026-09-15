'use client';

import { useRef, useState } from 'react';
import { Icon, Primary } from './need-ui';
import { LegalDocument, type LegalDocumentId } from './legal-document';

export type ConsentSelection = { age: boolean; terms: boolean; personal: boolean; sensitive: boolean; marketing: boolean };
export const EMPTY_CONSENT: ConsentSelection = { age:false, terms:false, personal:false, sensitive:false, marketing:false };
export const canContinue = (value: ConsentSelection) => value.age && value.terms && value.personal && value.sensitive;
const items = [
  { id:'age', label:'본인은 만 14세 이상입니다.', summary:'미오는 만 14세 이상부터 이용할 수 있어요.' },
  { id:'terms', label:'서비스 이용약관에 동의합니다.', summary:'서비스 이용과 관련된 권리와 의무를 확인해주세요.' },
  { id:'personal', label:'개인정보 수집 및 이용에 동의합니다.', summary:'계정 관리와 서비스 제공에 필요한 정보를 다뤄요.' },
  { id:'sensitive', label:'민감정보 수집 및 이용에 동의합니다.', summary:'감정·건강 정보가 포함된 대화와 그로부터 생성된 정보를 다뤄요.' },
  { id:'marketing', label:'마케팅 정보 수신에 동의합니다.', summary:'새로운 기능과 혜택을 안내해요. 동의하지 않아도 시작할 수 있어요.' },
] as const;

export function ConsentPanel({ value, onChange, onContinue, onCancel }: { value:ConsentSelection; onChange:(value:ConsentSelection)=>void; onContinue:()=>void; onCancel:()=>void }) {
  const [document, setDocument] = useState<LegalDocumentId>('terms');
  const dialog = useRef<HTMLDialogElement>(null);
  const allChecked = items.every(item => value[item.id]);
  const partiallyChecked = !allChecked && items.some(item => value[item.id]);
  function open(id:LegalDocumentId) { setDocument(id); dialog.current?.showModal(); dialog.current?.scrollTo(0,0); }
  return <>
    <section className="nf-consent-card" aria-labelledby="consent-heading">
      <div className="nf-consent-card-heading"><span className="nf-icon-tile"><Icon name="shield" size={22} /></span><div><p>시작을 위한 확인</p><h2 id="consent-heading">내 정보, 내가 선택해요.</h2></div></div>
      <label className="nf-consent-all">
        <input type="checkbox" checked={allChecked} ref={node => { if (node) node.indeterminate = partiallyChecked; }} onChange={event => { const checked = event.target.checked; onChange({ age:checked, terms:checked, personal:checked, sensitive:checked, marketing:checked }); }} />
        <span><strong>전체 동의</strong><span>만 14세 이상 확인과 선택 항목인 마케팅 정보 수신 동의를 포함해요.</span></span>
      </label>
      <div className="nf-consent-rows">
        {items.map(item => <div className={`nf-consent-row ${item.id === 'marketing' ? 'nf-consent-optional' : ''}`} key={item.id}>
          <label><input type="checkbox" checked={value[item.id]} onChange={e=>onChange({...value,[item.id]:e.target.checked})} /><span><span className="nf-consent-label">{item.label} <small>{item.id === 'marketing' ? '[선택]' : '[필수]'}</small></span><span className="nf-consent-summary">{item.summary}</span></span></label>
          {item.id !== 'age' && <button className="nf-consent-detail-button" onClick={()=>open(item.id as LegalDocumentId)} aria-label={`${item.label.replace('에 동의합니다.','')} 상세보기`}><Icon name="arrow" size={19} /></button>}
        </div>)}
      </div>
      <p className="nf-policy-link">내 정보의 처리 기준은 <button onClick={()=>open('privacy')}>개인정보 처리방침</button>에서 확인할 수 있어요.</p>
      <Primary onClick={onContinue} disabled={!canContinue(value)}>동의하고 시작하기</Primary>
      <button className="nf-text-button" onClick={onCancel}>다음에 할게요</button>
      <p className="nf-consent-preview">화면 미리보기 · 선택 내용은 가입이나 실제 서비스 동의로 제출되지 않아요.</p>
    </section>
    <dialog className="nf-legal-dialog" ref={dialog} aria-label="약관 상세보기" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
      <div className="nf-legal-toolbar"><span>Mio · 이용 문서</span><button onClick={()=>dialog.current?.close()} aria-label="상세보기 닫기"><Icon name="close" size={22} /></button></div>
      <LegalDocument document={document} />
      <div className="nf-legal-end"><button onClick={()=>dialog.current?.close()}>동의 화면으로 돌아가기</button></div>
    </dialog>
  </>;
}
