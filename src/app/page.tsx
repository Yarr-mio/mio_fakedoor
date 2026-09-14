'use client';
import { useEffect, useRef, useState } from 'react';
import { counselors, conversationPreferences, opening, demoReply, type PreferenceId, type CounselorId, type Scene } from '@/lib/counselors';
import { track, beginConversation, recordMessage } from '@/lib/experiment';

type Screen = 'discover' | 'chat' | 'feedback' | 'done';
type Message = { role: 'counselor'; scene: Scene } | { role: 'user'; text: string };
const filters = ['전체', '따뜻한 공감', '차분한 탐색', '여유 있는 경청'];

function Portrait({ id, className = '' }: { id: CounselorId; className?: string }) { return <div role="img" aria-label={`${counselors.find(c => c.id === id)!.name}의 일러스트형 AI 페르소나`} className={`portrait portrait-${id} ${className}`} />; }
function SceneText({ scene }: { scene: Scene }) { return <><p className="stage-direction">{scene.action}</p><p className="spoken">“{scene.speech}”</p>{scene.after && <p className="stage-direction after">{scene.after}</p>}</>; }
export default function Home() {
  const [screen, setScreen] = useState<Screen>('discover');
  const [id, setId] = useState<CounselorId>('seoyeon');
  const [filter, setFilter] = useState('전체');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [preference, setPreference] = useState<PreferenceId | null>(null);
  const conversationId = useRef<string | null>(null);
  const turnRef = useRef(0);
  const [reason, setReason] = useState('');
  const [alternative, setAlternative] = useState('');
  const [situation, setSituation] = useState('');
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState('');
  const [intent, setIntent] = useState('');
  const [expression, setExpression] = useState('');
  const [info, setInfo] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const focusHeading = useRef<HTMLHeadingElement>(null);
  const viewed = useRef(false);
  const counselor = counselors.find(c => c.id === id)!;
  const count = messages.filter(m => m.role === 'user').length;
  useEffect(() => { if (!viewed.current) { track('counsel_exposed'); viewed.current = true; } }, []);
  useEffect(() => { focusHeading.current?.focus(); }, [screen]);
  useEffect(() => { if (messages.length > 1) bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages]);
  function start(nextId: CounselorId) {
    setId(nextId);
    track('counselor_profile_click', { character: nextId });
    conversationId.current = null; turnRef.current = 0;
    setPreference(null); setMessages([]); setDraft(''); setRating(''); setIntent(''); setExpression('');
    setReason(''); setAlternative(''); setSituation(''); setComment(''); setScreen('chat');
  }
  function choosePreference(value: PreferenceId) {
    if (conversationId.current) return;
    conversationId.current = beginConversation(id, value);
    setPreference(value); setMessages([{ role: 'counselor', scene: opening(id, value) }]);
  }
  function home() { setScreen('discover'); setMessages([]); setDraft(''); }
  function send(value: string) {
    const text = value.trim();
    if (!text || !preference || !conversationId.current || turnRef.current >= 10) return;
    const turn = ++turnRef.current;
    setMessages(prev => [...prev, { role: 'user', text }, { role: 'counselor', scene: demoReply(id, preference, turn) }]); setDraft('');
    recordMessage(conversationId.current, id, turn, text.length);
  }
  function finish() {
    track('feedback_submitted', { character: id, preference: preference || 'unselected', rating, intent, expression, turns: count, reason, alternative, situation, comment: comment.trim() }, conversationId.current);
    setMessages([]); setDraft(''); setScreen('done');
  }
  return <div className="counsel-app">
    <div className="app-main"><header className="topbar"><button className="brand" onClick={home}>mio<span className="mio-spark">✳</span></button><span className="brand-description">마음을 나누는 AI 상담</span><nav><button className={screen === 'discover' ? 'header-link current' : 'header-link'} onClick={home}>AI 상담사 만나기</button><button className="header-link" onClick={() => setInfo(!info)} aria-expanded={info}>Mio 소개</button></nav></header>
    {info && <section className="service-note"><strong>가상의 AI 상담사와 만나는 프런트 체험입니다.</strong><p>Mio의 상담사는 사람을 닮은 가상의 AI 캐릭터입니다. 실제 사람 상담사와 연결되지 않습니다. 답변과 행동 묘사는 미리 작성된 예시로, 입력 내용을 분석하지 않습니다. 대화 원문은 저장·전송하지 않고 선택 기록만 이 브라우저에 보관합니다.</p><button onClick={() => setInfo(false)}>닫기 ×</button></section>}
    {screen === 'discover' ? <main className="discover"><div className="discovery-heading"><div><p className="overline">MIO, HERE FOR YOU</p><h1 ref={focusHeading} tabIndex={-1}>마음이 복잡한 날,<br />미오에게 기대어도 괜찮아요.</h1><p className="heading-description">조언보다 공감이, 정답보다 대화가 필요한 순간.<br />나의 속도에 맞춰 이야기하는 AI 상담사를 만나보세요.</p></div><div className="intro-note"><span>✧</span><p>오늘 마음은 어때요?</p><small>어떤 이야기든, 천천히 들려줘요.</small></div></div>
    <div className="section-title"><h2>오늘, 누구에게 마음을 나눌까요?</h2><span>Mio의 AI 상담사</span></div><div className="filters" role="group" aria-label="대화 스타일">{filters.map(f => <button key={f} aria-pressed={filter === f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
    <div className="counselor-grid">{counselors.filter(c => filter === '전체' || c.style === filter).map(c => <article className="counselor-card" key={c.id}><button className="card-portrait-button" onClick={() => start(c.id)} aria-label={`${c.name} 상담실 입장`}><Portrait id={c.id} /><span className="photo-label">✧ AI 상담사</span><div className="portrait-overlay"><p>{c.subtitle}</p><h3>{c.name}<span>{c.style}</span></h3></div></button><div className="card-body"><div className="tags">{c.tags.map(t => <span key={t}>#{t}</span>)}</div><p className="counselor-intro">“{c.intro}”</p><div className="card-scene"><span>첫 만남</span><p>{c.greeting.action}</p></div><button className="start-button" onClick={() => start(c.id)}>마음 나누기 <span>↗</span></button></div></article>)}</div>
    <div className="experience-note"><div className="note-icon">❝</div><div><h3>미오는 말 사이의 여백도 함께해요</h3><p><i>고개를 끄덕이며, 이야기를 기다린다.</i> 표정과 몸짓을 담은 이야기로, 조금 더 따뜻하게 다가갈게요.</p></div><span className="note-pill">대사 + 비언어적 표현</span></div>
    <p className="discovery-disclaimer">가상의 AI 상담사와 미리 작성된 응답으로 진행하는 예시 체험입니다. 실제 심리상담·진단 서비스가 아닙니다.</p></main> : screen === 'chat' ? <main className="room-layout"><section className="conversation"><div className="room-heading"><button onClick={home} aria-label="상담사 목록으로">←</button><Portrait id={id} className="avatar" /><div><h1 ref={focusHeading} tabIndex={-1}>{counselor.name}<span className="name-ai">AI</span></h1><p>{counselor.style} · AI 상담사</p></div><button className="finish-link" onClick={() => setScreen('feedback')}>대화 마치기</button></div><div className="demo-strip">예시 체험 · 답변과 행동 묘사는 미리 작성되어 있어요.</div><div className="chat-scroll">{!preference ? <div className="preference-entry"><p className="overline">내가 편안한 방식으로</p><h2>오늘은 어떻게<br />이야기하고 싶으세요?</h2><p>사정을 설명하지 않아도 괜찮아요.<br />지금 필요한 방식 하나만 골라주세요.</p><div className="preference-options">{conversationPreferences.map(p => <button key={p.id} onClick={() => choosePreference(p.id)}><span>{p.label}<small>{p.hint}</small></span><span aria-hidden="true">↗</span></button>)}</div><small>선택한 뒤에도 언제든 대화를 멈출 수 있어요.</small></div> : <div className="room-setting"><span>{conversationPreferences.find(p => p.id === preference)?.label}</span><p>{counselor.room}. 답을 재촉하지 않고, 작은 이야기부터.</p></div>}<div className="message-list" role="log" aria-live="polite" aria-label="상담 대화">{messages.map((m, i) => <div key={i} className={`chat-message ${m.role}`}>{m.role === 'counselor' && <Portrait id={id} className="avatar" />}<div className="message-content">{m.role === 'counselor' ? <><span className="speaker">{counselor.name} · Mio AI</span><div className="dialogue-bubble"><SceneText scene={m.scene} /></div></> : <div className="user-bubble">{m.text}</div>}</div></div>)}<div ref={bottom} /></div></div><div className="chat-input-area">{!preference ? <p className="entry-footnote">어떤 대화를 원하는지 고르면, {counselor.name}이 먼저 말을 건넬게요.</p> : count < 10 ? <form className="composer" onSubmit={e => { e.preventDefault(); send(draft); }}><label className="sr-only" htmlFor="message">상담 메시지</label><textarea id="message" rows={2} maxLength={1000} value={draft} onChange={e => setDraft(e.target.value)} placeholder={`${counselor.name}에게 편하게 이야기해 보세요…`} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); } }} /><button disabled={!draft.trim()} aria-label="메시지 보내기">↑</button></form> : <button className="primary" onClick={() => setScreen('feedback')}>이 대화는 어땠나요? <span>→</span></button>}<div className="input-footnote"><span>대화 원문은 저장·전송되지 않아요.</span><span>{count}/10 · 예시 대화</span></div></div></section><aside className="room-profile"><Portrait id={id} className="profile-photo" /><span className="profile-kicker">MIO AI COUNSELOR</span><h2>{counselor.name}</h2><p>{counselor.subtitle}</p><div className="tags">{counselor.tags.map(t => <span key={t}>#{t}</span>)}</div><blockquote>“{counselor.intro}”</blockquote><div className="profile-detail"><h3>이 상담실에서는</h3><p>급하게 답을 찾지 않아도 돼요.<br />말을 멈춰도, 다시 시작해도 괜찮아요.</p></div><small>Mio의 일러스트형 AI 페르소나<br />실제 전문가의 경력·자격을 나타내지 않습니다.</small></aside></main> : <main className="reflection"><button className="back-link" onClick={screen === 'feedback' ? () => setScreen('chat') : home}>← {screen === 'feedback' ? '대화로 돌아가기' : '상담사 둘러보기'}</button><Portrait id={id} className="reflection-avatar" />{screen === 'feedback' ? <><p className="overline">AFTER OUR CONVERSATION</p><h1 ref={focusHeading} tabIndex={-1}>오늘의 대화,<br />어떻게 느껴졌나요?</h1><p className="reflection-description">{counselor.name}와의 예시 체험에 대한 생각을 들려주세요.</p><form onSubmit={e => { e.preventDefault(); finish(); }}><fieldset><legend>이 상담사에게 이야기하는 건 편안했나요?</legend><div className="answer-options">{['부담스러웠어요', '잘 모르겠어요', '편안했어요'].map(v => <button type="button" key={v} aria-pressed={rating === v} className={rating === v ? 'selected' : ''} onClick={() => setRating(v)}>{v}</button>)}</div></fieldset><fieldset><legend>표정·몸짓 묘사는 대화에 어떤 영향을 줬나요?</legend><div className="answer-options">{['어색했어요', '차이 없었어요', '몰입에 도움 됐어요'].map(v => <button type="button" key={v} aria-pressed={expression === v} className={expression === v ? 'selected' : ''} onClick={() => setExpression(v)}>{v}</button>)}</div></fieldset><fieldset><legend>실제 AI 대화가 가능하면 다시 찾아오고 싶나요?</legend><div className="answer-options">{['아니요', '아직 모르겠어요', '다시 오고 싶어요'].map(v => <button type="button" key={v} aria-pressed={intent === v} className={intent === v ? 'selected' : ''} onClick={() => setIntent(v)}>{v}</button>)}</div></fieldset><fieldset><legend>오늘 이곳을 찾은 이유는 무엇에 가까운가요? <small>선택</small></legend><div className="qualitative-options">{['사람에게 말하기는 부담스러워서', '누군가 먼저 말을 걸어줬으면 해서', '생각을 정리하고 싶어서', '그냥 궁금해서', '다른 이유'].map(v => <button type="button" key={v} className={reason === v ? 'selected' : ''} aria-pressed={reason === v} onClick={() => setReason(reason === v ? '' : v)}>{v}</button>)}</div></fieldset><fieldset><legend>어떤 순간에 들어왔나요? <small>선택</small></legend><div className="qualitative-options">{['하루가 끝나고 혼자일 때', '일이나 공부가 버거울 때', '관계 때문에 마음이 복잡할 때', '특별한 고민 없이 둘러보던 중'].map(v => <button type="button" key={v} className={situation === v ? 'selected' : ''} aria-pressed={situation === v} onClick={() => setSituation(situation === v ? '' : v)}>{v}</button>)}</div></fieldset><fieldset><legend>이곳이 없었다면 무엇을 했을까요? <small>선택</small></legend><div className="qualitative-options">{['친구·가족에게 이야기', 'ChatGPT 등 다른 AI', '눕거나 잠자기', '유튜브·SNS 보기', '아무것도 하지 않기', '다른 방법'].map(v => <button type="button" key={v} className={alternative === v ? 'selected' : ''} aria-pressed={alternative === v} onClick={() => setAlternative(alternative === v ? '' : v)}>{v}</button>)}</div></fieldset><label className="comment-label" htmlFor="feedback-comment">다음에도 찾을 이유, 또는 찾지 않을 이유가 있나요? <small>선택</small></label><textarea className="feedback-comment" id="feedback-comment" value={comment} onChange={e => setComment(e.target.value)} maxLength={500} rows={3} placeholder="내가 쓰던 방법과 비교해, 솔직하게 알려주세요." /><p className="local-note">남기는 의견은 선택 응답과 함께 이 브라우저에만 보관돼요.<br />이름·연락처 등 개인정보는 적지 않아도 됩니다.</p><button className="primary" disabled={!rating || !intent || !expression}>생각 남기기 <span>→</span></button><p className="local-note">응답은 이 브라우저에만 보관됩니다.</p></form></> : <><p className="overline">A MOMENT FOR YOURSELF</p><h1 ref={focusHeading} tabIndex={-1}>이야기를 꺼내줘서<br />고마워요.</h1><p className="stage-direction reflection-action">부드러운 미소와 함께 인사를 건넨다.</p><p className="reflection-description">“오늘은 마음이 조금 덜 무거웠으면 좋겠어요.”</p><p className="local-note">체험 피드백을 이 브라우저에 보관했어요.</p><button className="primary" onClick={() => { start(id); }}>같은 상담사와 다시 체험하기 <span>↗</span></button><button className="back-link another" onClick={home}>다른 상담사 만나보기 →</button></>}</main>}
    </div></div>;
}
