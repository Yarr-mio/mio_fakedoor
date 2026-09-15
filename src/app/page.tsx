'use client';

import Link from 'next/link';
import { useInternalMode } from '@/lib/use-internal-mode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NEEDS, SUPPORT_RESOURCES, openingFor, summaryOf, summaryCases, type DemoMessage, type Need, type Screen } from '@/lib/need-flow';
import { trackNeed } from '@/lib/need-events';
import { Choice, Icon, Mio, Primary } from '@/components/need-ui';
import { ConsentPanel, EMPTY_CONSENT, canContinue } from '@/components/consent-panel';
import { mockFollowUp } from '@/lib/mock-dialogue-policy';
import { scenarioById } from '@/lib/conversation-scenarios';
import { MockChatComposer } from '@/components/mock-chat-composer';
import './prototype.css';

export default function Home() {
  const internal = useInternalMode();
  const [screen, setScreen] = useState<Screen>('landing');
  const [need, setNeed] = useState<Need>('listen');
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [scenarioRun, setScenarioRun] = useState(0);
  const [resumedAt, setResumedAt] = useState(-1);
  const followUp = resumedAt === messages.length ? 'offer' : mockFollowUp(messages);
  const [mockPreview, setMockPreview] = useState('');
  const hasUserMessage = messages.some(message => message.role === 'user');
  const hasFixture = messages.some(message => message.role === 'user' && message.source === 'fixture');
  const [followup, setFollowup] = useState('');
  const [consent, setConsent] = useState({...EMPTY_CONSENT});
  const [pendingNeed, setPendingNeed] = useState<Need | null>(null);
  const [returnScreen, setReturnScreen] = useState<Screen>('landing');
  const [summary, setSummary] = useState('');
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [rating, setRating] = useState('');
  const [toast, setToast] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);

  useEffect(() => { if (!viewed.current) { trackNeed('landing_viewed'); viewed.current = true; } }, []);
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }); }, [screen]);
  useEffect(() => { if (screen === 'chat') log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'auto' }); }, [messages, mockPreview, screen]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);

  function openSupport(from: Screen) {
    if (from !== 'support') setReturnScreen(from);
    setScreen('support'); trackNeed('support_opened', { screen: from });
  }
  function resetContent() {
    setResumedAt(-1); setScenarioId(null); setMessages([]); setMockPreview(''); setSummary(''); setSummaryDirty(false); setEditDraft(''); setEditing(false); setRating(''); setFollowup('');
  }
  function begin(next: Need | null = null) {
    trackNeed('entry_clicked', { screen: 'landing', ...(next ? { need: next } : {}) });
    resetContent(); setPendingNeed(next); setConsent({...EMPTY_CONSENT}); setScreen('intro');
  }
  function selectNeed(value: Need) {
    trackNeed('need_selected', { need: value });
    if (value === 'support') { openSupport('needs'); return; }
    setNeed(value); setScreen('chat'); setMessages([{ role: 'mio', text: openingFor(value) }]);
    trackNeed('demo_started', { need: value });
  }
  function acknowledge() {
    if (!canContinue(consent)) return;
    trackNeed('notice_acknowledged');
    if (pendingNeed) selectNeed(pendingNeed); else setScreen('needs');
  }
  function selectScenario(id: string) {
    const scenario = scenarioById(id);
    if (!scenario) return;
    setScenarioRun(previous => previous + 1);
    resetContent(); setScenarioId(id); setNeed(scenario.need);
    setMessages([{role:'mio',text:openingFor(scenario.need)}]);
    trackNeed('scenario_selected', {resource:id, need:scenario.need});
  }
  function appendMockMessage(message: DemoMessage) {
    setMessages(previous => [...previous, message]);
    if (summaryDirty && message.role === 'user') setToast('수정한 정리는 유지돼요. 새 내용을 반영하려면 정리 화면에서 다시 불러와주세요.');
  }
  function openSummary() {
    if (!summaryDirty) setSummary(summaryOf(messages));
    setEditing(false); setScreen('summary'); trackNeed('summary_opened', { need, rating: hasFixture ? 'selected_fixtures' : 'default_sample' });
  }
  function endQuietly() { trackNeed('conversation_ended_quietly', { need }); resetContent(); setScreen('quiet_done'); }
  function finish() { if (followUp === 'end') { endQuietly(); return; } setScreen('finish'); trackNeed('finish_opened', { screen }); }
  function complete(withFeedback: boolean) {
    if (withFeedback && !rating) return;
    trackNeed(withFeedback ? 'feedback_submitted' : 'feedback_skipped', withFeedback ? { rating } : {});
    trackNeed('prototype_finished'); resetContent(); setScreen('done');
  }
  function changeDirection(value: Need) {
    dialog.current?.close(); trackNeed('direction_changed', { need: value });
    if (value === 'support') { openSupport(screen); return; }
    setResumedAt(-1); setNeed(value); setScreen('chat'); setToast('대화 예시는 유지하고, 선택한 방향을 바꿨어요.');
  }
  function downloadSummary() {
    const blob = new Blob([`Mio · 가상 대화 예시\nAI가 생성한 개인 상담 요약이 아닙니다.\n\n${summary}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'mio-example-note.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    trackNeed('summary_downloaded'); setToast('정리 파일 다운로드를 요청했어요.');
  }
  const title = (text: ReactNode) => <h1 ref={heading} tabIndex={-1}>{text}</h1>;
  const needLabel = need === 'unsure' ? '천천히 시작하기' : NEEDS.find(item => item.id === need)?.title;
  const home = () => { resetContent(); setScreen('landing'); };

  return <div className="nf-app nf-light">
    <a className="nf-skip" href="#main">본문으로 건너뛰기</a>
    <header className="nf-header">
      <button className="nf-brand" onClick={home} aria-label="Mio 처음으로"><span className="nf-official-logo" aria-hidden="true" /></button>
      <span className="nf-brand-note">말하기 어려웠던 마음을 꺼내는 곳.</span>
      <nav aria-label="주 메뉴"><button onClick={() => openSupport(screen)}>지원 정보</button><button onClick={() => dialog.current?.showModal()}>{screen === 'chat' ? '방향 바꾸기' : '이용 안내'}</button><span className="nf-preview">PREVIEW</span></nav>
    </header>

    <main id="main" className={screen === 'landing' ? 'nf-landing' : screen === 'chat' ? 'nf-workspace' : screen === 'intro' ? 'nf-onboarding' : 'nf-inner'}>
      {screen === 'landing' && <>
        <section className="nf-hero">
          <div className="nf-hero-copy"><p className="nf-eyebrow"><span /> 미오와 이야기하기</p>{title(<>마음이 복잡한 날,<br />어디서부터 말할지<br /><em>함께 시작해요.</em></>)}<p className="nf-lead">이야기를 꺼내거나, 생각을 정리하거나.<br />지금 필요한 도움부터 선택해보세요.</p><div className="nf-hero-actions"><Primary onClick={() => begin()}>미오와 시작하기</Primary><span>이용 안내와 동의 화면부터 시작해요 · 미리보기</span></div></div>
          <div className="nf-hero-art"><div className="nf-orbit nf-orbit-one" /><div className="nf-orbit nf-orbit-two" /><span className="nf-art-star star-one">✧</span><span className="nf-art-star star-two">✧</span><div className="nf-floating-note"><span className="nf-tiny-dot" />오늘은, 어떤 마음인가요?</div><div className="nf-art-glow" /><Mio hero /><div className="nf-art-caption">지금 떠오르는 이야기부터.</div></div>
        </section>
        <section className="nf-needs-section" aria-labelledby="need-section-title"><div className="nf-section-heading"><div><p className="nf-eyebrow">내가 필요한 만큼</p><h2 id="need-section-title">지금, 어떤 도움이 필요한가요?</h2></div><span>하나를 골라도, 도중에 바꿔도 괜찮아요.</span></div><div className="nf-need-grid">{NEEDS.map(item => <button className={`nf-need-card nf-need-${item.id}`} key={item.id} onClick={() => item.id === 'support' ? openSupport('landing') : begin(item.id)}><span className="nf-card-top"><span className="nf-icon-tile"><Icon name={item.icon} size={25} /></span><span className="nf-card-number">{item.number}</span></span><h3>{item.title}</h3><p>{item.description}</p><span className="nf-card-bottom">{item.id === 'support' ? '공식 정보 살펴보기' : '예시 체험하기'}<Icon name="arrow" size={20} /></span></button>)}</div><button className="nf-unsure" onClick={() => begin('unsure')}>아직 잘 모르겠어요 <Icon name="arrow" size={16} /></button></section>
        <section className="nf-promise"><Icon name="spark" size={29} /><div><h2>대화만 하고 마쳐도 괜찮아요.</h2><p>대화의 방향과 마무리는 언제나 내가 선택해요.</p></div><span>선택은 언제나 나에게</span></section>
        <p className="nf-disclaimer">준비된 대화로 미오의 사용 흐름을 살펴보세요.<br className="nf-mobile-only" /> 실제 AI 대화는 아직 제공하지 않아요.</p>
      </>}

      {screen === 'intro' && <div className="nf-onboarding-grid">
        <section className="nf-onboarding-copy"><button className="nf-back" onClick={home}><Icon name="back" size={18} />처음으로</button><p className="nf-eyebrow">미오와 시작하기</p>{title(<>이야기를 시작하기 전,<br /><em>내 선택부터.</em></>)}<p className="nf-description">미오가 어떤 정보를 다루는지 확인하고,<br />동의할 항목을 직접 선택해주세요.</p><div className="nf-onboarding-note"><span className="nf-icon-tile"><Icon name="chat" size={22} /></span><div><h2>말하기 어려웠던 마음을 꺼내는 곳.</h2><p>마음을 이야기하고 생각을 정리하는 공간이에요.<br />전문 상담이나 진단·치료를 대신하지 않아요.</p></div></div><p className="nf-onboarding-footnote">현재는 준비된 답변으로 대화 흐름을 확인할 수 있어요.<br />실제 AI 대화는 아직 제공하지 않아요.</p></section>
        <ConsentPanel value={consent} onChange={setConsent} onContinue={acknowledge} onCancel={home} />
      </div>}

      {screen === 'needs' && <section className="nf-panel"><button className="nf-back" onClick={() => setScreen('intro')}><Icon name="back" size={18} />이용 안내</button><p className="nf-eyebrow">필요 선택</p>{title(<>지금 필요한 것부터<br />시작해볼까요?</>)}<p className="nf-description">정답은 없어요. 도중에 방향을 바꿀 수 있어요.</p><div className="nf-choice-list">{NEEDS.map(item => <Choice key={item.id} {...item} onClick={() => selectNeed(item.id)} />)}<Choice title="아직 잘 모르겠어요" description="예시를 보면서 천천히 골라볼게요." icon="spark" onClick={() => selectNeed('unsure')} /></div><button className="nf-text-button" onClick={home}>지금은 둘러보기만 할게요</button></section>}

      {screen === 'chat' && <>
        <aside className="nf-chat-aside"><p className="nf-eyebrow">미오와 잠깐</p><h2>지금 필요한<br />이야기부터.</h2><p>처음부터 잘 설명하려고<br />애쓰지 않아도 괜찮아요.</p><div className="nf-aside-mio"><Mio size={150} /></div><div className="nf-current-need"><span>지금 선택한 방향</span><strong>{needLabel}</strong><button onClick={() => dialog.current?.showModal()}>다른 방향 선택하기 <Icon name="arrow" size={16} /></button></div>{internal && <Link className="nf-tone-link" href="/tone-guide" target="_blank" rel="noopener noreferrer">대화 톤 가이드 <Icon name="external" size={14} /></Link>}</aside>
        <section className="nf-chat-panel"><div className="nf-chat-heading"><Mio size={40} /><div>{title('미오와 잠깐, 이야기')}<p>{needLabel}</p></div><button className="nf-small-button" onClick={finish}>마무리</button></div><div className="nf-demo-banner"><span className="nf-tag">예시 체험</span>준비된 답변으로 진행해요. 입력을 이해하는 실제 AI 대화는 아직 제공하지 않아요.</div><div className="nf-chat-log" ref={log} role="log" aria-label="가상 대화 예시" aria-live="polite">{messages.map((message, index) => <div className={`nf-message nf-message-${message.role}`} key={index}>{message.role === 'mio' && <span className="nf-message-star">✳</span>}<div>{message.role === 'mio' && <span className="nf-speaker">미오</span>}<p>{message.text}</p></div></div>)}{mockPreview && <div className="nf-message nf-message-mio" aria-hidden="true"><span className="nf-message-star">✳</span><div><span className="nf-speaker">미오</span><p>{mockPreview}<span className="nf-stream-cursor">▍</span></p></div></div>}</div><div className="nf-chat-controls"><div className="nf-quick-actions"><button onClick={() => dialog.current?.showModal()}><Icon name="compass" size={16} />방향 바꾸기</button>{(followUp === 'offer' || followUp === 'wait') && <button onClick={openSummary}><Icon name="note" size={16} />정리 보기</button>}<button onClick={() => openSupport('chat')}><Icon name="external" size={15} />지원 정보</button>{internal && <Link className="nf-tone-link-mobile" href="/tone-guide" target="_blank" rel="noopener noreferrer">톤 가이드 ↗</Link>}</div><MockChatComposer key={`${need}:${scenarioId ?? "free"}:${scenarioRun}`} need={need} hasUserMessage={hasUserMessage} scenarioId={scenarioId} messages={messages} followUp={followUp} onResume={() => setResumedAt(messages.length)} onEnd={endQuietly} onScenario={selectScenario} onMessage={appendMockMessage} onPreview={setMockPreview} /></div></section>
      </>}

      {screen === 'summary' && <section className="nf-panel nf-summary-panel"><button className="nf-back" onClick={() => setScreen('chat')}><Icon name="back" size={18} />대화로 돌아가기</button><p className="nf-eyebrow">원할 때만, 이야기 정리</p>{title(<>꺼낸 이야기를,<br />나눠서 살펴볼까요?</>)}<p className="nf-description">{hasFixture ? '선택한 대화 예시를 상황·감정·고민으로 나눴어요.' : '이런 모습으로 정리할 수 있어요. 아래는 가상의 샘플이에요.'}<br />직접 입력한 문장을 분석한 결과는 아니에요.</p>
        {editing ? <article className="nf-note-paper"><label className="nf-edit-label" htmlFor="example-note">정리 수정 · 가상의 내용으로 작성해주세요</label><textarea id="example-note" value={editDraft} onChange={event => setEditDraft(event.target.value)} maxLength={6000} rows={12} /><div className="nf-inline-actions"><button onClick={() => { setSummary(editDraft); setSummaryDirty(true); setEditing(false); trackNeed('summary_edited'); }}>수정 적용</button><button onClick={() => setEditing(false)}>취소</button></div></article> : summaryDirty ? <article className="nf-note-paper"><h2>내가 수정한 정리</h2><p className="nf-note-content">{summary}</p></article> : <div className="nf-summary-cases">{summaryCases(messages).map(example => <article className="nf-note-paper" key={example.id}><div className="nf-note-title"><Icon name="note" size={18}/><h2>{example.label} · 대화 예시</h2></div><blockquote>{example.user}</blockquote><dl>{[['상황',example.summary.situation],['표현한 감정',example.summary.feeling],['남아 있는 고민·요청',example.summary.concern]].map(([label,text])=><div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl></article>)}</div>}
        {!editing && <div className="nf-summary-actions"><button onClick={() => { setEditDraft(summary); setEditing(true); }}><Icon name="edit" size={17}/>내가 수정하기</button>{summaryDirty && <button onClick={() => { setSummary(summaryOf(messages)); setSummaryDirty(false); }}>예시 정리 다시 불러오기</button>}</div>}
        <p className="nf-fine">말하지 않은 감정이나 상대방의 의도는 단정하지 않아요. 수정은 현재 화면에만 남고, 내려받은 파일은 기기에 남아요.</p><Primary onClick={downloadSummary} disabled={editing || !summary.trim()} icon="download">이 정리를 파일로 받기</Primary><button className="nf-text-button" onClick={finish}>저장하지 않고 마무리하기</button></section>}

      {screen === 'support' && <section className="nf-panel nf-support-panel"><button className="nf-back" onClick={() => setScreen(returnScreen)}><Icon name="back" size={18} />이전 화면으로</button><p className="nf-eyebrow">도움 알아보기</p>{title(<>도움을 알아보는 것도,<br />하나의 시작이에요.</>)}<p className="nf-description">내 상황을 설명하거나 대화하지 않아도 돼요.<br />필요한 정보부터 직접 살펴보세요.</p><div className="nf-resource-list">{SUPPORT_RESOURCES.map(resource => <a key={resource.id} href={resource.url} target="_blank" rel="noopener noreferrer" onClick={() => trackNeed('support_link_clicked', { resource: resource.id })}><span className="nf-resource-icon"><Icon name="compass" /></span><div><small>{resource.organization}</small><h2>{resource.title}</h2><p>{resource.description}</p><span>공식 사이트에서 확인하기 <Icon name="external" size={14} /></span></div></a>)}</div><div className="nf-support-notice"><Icon name="shield" size={20} /><p>외부 사이트가 새 창으로 열립니다. 대상·비용·운영시간은 해당 기관에서 확인해주세요. Mio가 예약이나 상담 연결을 대신하지는 않아요.</p></div><p className="nf-fine">공식 링크 확인: 2026. 09. 15.<br />이 체험은 응급 상황에 대응하거나 사람에게 실시간 연결하는 서비스가 아닙니다.</p><button className="nf-secondary" onClick={finish}>여기서 마무리하기<Icon name="arrow" size={18} /></button></section>}

      {screen === 'finish' && <section className="nf-panel"><p className="nf-eyebrow">마무리도 나의 선택</p>{title(<>지금은,<br />어떻게 마무리할까요?</>)}<p className="nf-description">정리나 다음 행동을 꼭 선택하지 않아도 괜찮아요.</p><div className="nf-choice-list">{messages.length > 0 && <><Choice title="대화 예시 다시 보기" description="지금까지의 흐름을 다시 살펴볼게요." icon="chat" onClick={() => setScreen('chat')} /><Choice title="이야기 정리 보기" description="상황·감정·고민으로 나눈 예시를 살펴볼게요." icon="note" onClick={openSummary} /></>}<Choice title="지원 정보 알아보기" description="공식 기관 정보를 직접 확인할게요." icon="compass" onClick={() => openSupport('finish')} /><Choice title="여기서 마칠게요" description="오늘은 이만큼이면 충분해요." icon="close" onClick={() => setScreen('feedback')} /></div><button className="nf-text-button" onClick={() => complete(false)}>피드백 없이 바로 종료하기</button></section>}

      {screen === 'feedback' && <section className="nf-panel nf-centered"><Mio size={94} /><p className="nf-eyebrow">짧은 피드백 · 선택</p>{title(<>이번 화면 체험은<br />어떠셨나요?</>)}<p className="nf-description">원하는 도움을 찾고 이동하기 편했나요?</p><fieldset className="nf-rating"><legend className="sr-only">화면 이용 경험</legend>{[{ id: 'easy', icon: '☺', text: '편했어요' }, { id: 'unknown', icon: '·ᴗ·', text: '잘 모르겠어요' }, { id: 'difficult', icon: '☹', text: '불편했어요' }].map(item => <button key={item.id} aria-pressed={rating === item.id} className={rating === item.id ? 'nf-selected' : ''} onClick={() => setRating(item.id)}><span aria-hidden="true">{item.icon}</span>{item.text}</button>)}</fieldset><Primary onClick={() => complete(true)} disabled={!rating}>의견 남기고 마치기</Primary><p className="nf-fine">선택 응답은 이 브라우저에만 보관돼요.</p><button className="nf-text-button" onClick={() => complete(false)}>건너뛰고 마칠게요</button></section>}

      {screen === 'quiet_done' && <section className="nf-panel nf-centered"><Mio size={80}/><p className="nf-eyebrow">대화를 마쳤어요</p>{title('여기서 마칠게요.')}<p className="nf-description">더 답하거나 평가를 남기지 않아도 돼요.</p><button className="nf-text-button" onClick={home}>홈으로</button></section>}

      {screen === 'done' && <section className="nf-panel nf-centered nf-done"><Mio size={94}/><p className="nf-eyebrow">오늘의 마무리</p>{title(<>둘러봐줘서 고마워요.<br />다음은 어떻게 할까요?</>)}<p className="nf-description">다른 도움이 필요해도, 지금 쓰는 방법으로 충분해도 괜찮아요.</p><div className="nf-choice-list nf-followup-choices"><Choice title="사용 경험 인터뷰에 관심 있어요" description="필요했던 도움과 불편했던 점을 미오 팀에 이야기하고 싶어요." icon="chat" onClick={() => { setScreen('interest'); trackNeed('interest_opened'); trackNeed('interview_interest_selected'); }} />{[{id:'perspective',title:'다른 관점이나 정보가 더 필요해요',description:'이야기를 나누는 것만으로는 부족해요.'},{id:'existing',title:'지금 쓰는 방법으로 충분해요',description:'기존 AI, 메모, 주변 사람 등 다른 방법이 있어요.'},{id:'none',title:'지금은 더 필요한 게 없어요',description:'다음 선택 없이 여기서 마칠게요.'}].map(choice=><button key={choice.id} aria-pressed={followup===choice.id} onClick={()=>{setFollowup(choice.id);trackNeed('followup_choice',{rating:choice.id});}}><span className="nf-icon-tile"><Icon name={followup===choice.id?'check':'compass'}/></span><span><strong>{choice.title}</strong><small>{choice.description}</small></span></button>)}</div>{followup && <p className="nf-followup-response" role="status">{followup==='existing'?'지금 쓰는 방법이 충분하다는 선택도 중요해요. 알려줘서 고마워요.':followup==='perspective'?'대화 외에 관점이나 정보가 필요하다는 뜻으로 남겼어요.':'여기서 마쳐도 괜찮아요. 알려줘서 고마워요.'}</p>}<button className="nf-text-button" onClick={home}>선택 없이 홈으로</button></section>}
      {screen === 'interest' && <section className="nf-panel nf-centered"><span className="nf-large-icon"><Icon name="chat" size={36}/></span><p className="nf-eyebrow">미오 팀과 이야기하기</p>{title(<>어떤 도움이 필요했는지,<br />듣고 싶어요.</>)}<p className="nf-description">마음에 들었던 점뿐 아니라, 필요 없었던 점과<br />지금 쓰는 다른 방법도 들려주세요.</p><div className="nf-interview-details"><h2>사용 경험 인터뷰 문의</h2><p>상담 신청이 아닌 서비스 개선을 위한 인터뷰 문의예요. 일정·진행 방식과 참여 여부는 팀과 확인한 뒤 결정할 수 있어요.</p><p>첫 문의에는 참여 의향만 알려주세요. 건강 정보나 개인적인 대화 내용은 보내지 않아도 돼요. 녹음·인용이 필요하면 별도로 안내하고 동의를 받아야 해요.</p></div><a className="nf-interview-contact" href="mailto:mio.official402@gmail.com?subject=Mio%20%EC%82%AC%EC%9A%A9%20%EA%B2%BD%ED%97%98%20%EC%9D%B8%ED%84%B0%EB%B7%B0%20%EB%AC%B8%EC%9D%98" onClick={()=>trackNeed('interview_contact_opened')}>이메일로 인터뷰 문의하기<Icon name="external" size={18}/></a><p className="nf-fine">이메일 앱이 열려요. 직접 전송해야 팀에 전달됩니다.<br />문의처: mio.official402@gmail.com</p><button className="nf-text-button" onClick={()=>setScreen('done')}>지금은 문의하지 않을게요</button></section>}
    </main>

    {screen !== 'chat' && <footer className="nf-footer"><span className="nf-footer-brand"><span className="nf-official-logo" role="img" aria-label="Mio" /><span className="nf-brand-tagline">말하기 어려웠던 마음을<br />꺼내는 곳.</span></span><div><button onClick={() => dialog.current?.showModal()}>이용 안내</button><Link href="/legal/privacy" target="_blank" rel="noopener noreferrer">개인정보 처리방침</Link>{internal && <Link href="/prototype-review?internal=1">팀용 기록</Link>}</div></footer>}
    <dialog ref={dialog} className="nf-dialog" aria-labelledby="nf-dialog-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}><div className="nf-dialog-body"><button className="nf-dialog-close" onClick={() => dialog.current?.close()} aria-label="닫기"><Icon name="close" /></button>{screen === 'chat' ? <><p className="nf-eyebrow">대화 방향 선택</p><h2 id="nf-dialog-title">지금 필요한 도움으로<br />방향을 바꿔볼까요?</h2><p>선택한 대화 예시는 그대로 유지돼요.</p><div className="nf-choice-list">{NEEDS.map(item => <Choice key={item.id} {...item} onClick={() => changeDirection(item.id)} />)}<Choice title="아직 잘 모르겠어요" icon="spark" onClick={() => changeDirection('unsure')} /></div></> : <><p className="nf-eyebrow">이용 안내</p><h2 id="nf-dialog-title">미오를 이용하기 전에</h2><p>마음을 이야기하고 생각을 정리하는 공간이에요. 전문 상담이나 진단·치료, 긴급 구조를 대신하지 않아요.</p><p>현재는 준비된 답변을 보여드려요. 입력한 내용을 이해하고 답하는 실제 AI 대화는 아직 제공하지 않아요.</p><details className="nf-consent-details"><summary>내 정보는 어떻게 다루나요?</summary><p>입력한 이야기는 현재 화면에서만 사용하며 서버에 보내지 않아요. 처음으로 돌아가거나 대화를 종료·새로고침하면 지워져요. 직접 내려받은 파일은 기기에 남아요.</p><p>버튼 선택 등 이용 기록은 이 브라우저에 남아요. 대화 원문은 포함하지 않아요.</p></details><button className="nf-secondary" onClick={() => dialog.current?.close()}>확인했어요<Icon name="check" size={18} /></button></>}</div></dialog>
    <div className={`nf-toast ${toast ? 'nf-toast-visible' : ''}`} role="status">{toast}</div>
  </div>;
}
