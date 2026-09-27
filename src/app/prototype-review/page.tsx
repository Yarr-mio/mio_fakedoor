'use client';

import Link from 'next/link';
import { useInternalMode } from '@/lib/use-internal-mode';
import { useState } from 'react';
import { clearNeedEvents, EVENT_NAMES, needMetrics, readNeedEvents, type NeedEvent } from '@/lib/need-events';
import '../prototype.css';

export default function PrototypeReview() {
  const internal = useInternalMode();
  const [events, setEvents] = useState<NeedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [includeInternal, setIncludeInternal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const filtered = events.filter(event => includeInternal || !event.internal);
  const metrics = needMetrics(filtered);
  function refresh() { setEvents(readNeedEvents()); setLoaded(true); }
  function download() {
    const rows = readNeedEvents().filter(event => includeInternal || !event.internal);
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 'need-flow-v5.2', source: 'this_browser_only', includeInternal, exportedAt: new Date().toISOString(), events: rows }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mio-need-flow-v5.2-events.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!internal) return <div className="nf-app nf-light"><main className="nf-inner"><h1>이 화면은 팀 검토용이에요.</h1><Link href="/">미오로 돌아가기</Link></main></div>;
  return <div className="nf-app nf-light"><main className="nf-audit"><Link href="/">← 화면 체험으로</Link><h1>이번 체험의 로컬 기록</h1><p>need-flow-v5.2 · 가상 대화 · 이 브라우저에 남은 기록만 표시합니다.</p><p>페이지를 새로 열 때마다 다른 방문 ID를 사용합니다. 고유 사람 수·실제 AI 이용·자기노출·상담 연결·베타 신청을 뜻하지 않습니다. 예시 선택과 직접 입력 발생을 구분합니다. 원문은 저장하지 않으며 목업 상태를 실제 AI 성능으로 해석하지 않습니다.</p><div className="nf-audit-actions"><button onClick={refresh}>기록 불러오기 / 새로고침</button><button onClick={download}>JSON 내려받기</button><button onClick={() => setConfirm(true)}>v5.2 로컬 기록 지우기</button></div><label><input type="checkbox" checked={includeInternal} onChange={event => setIncludeInternal(event.target.checked)} />팀 테스트 포함 (?internal=1)</label>{confirm && <div><p>이 브라우저의 v5.2 클릭 기록을 지울까요? 기존 v4·v5.1 기록과 내려받은 파일은 유지됩니다.</p><div className="nf-audit-actions"><button onClick={() => { clearNeedEvents(); refresh(); setConfirm(false); setMessage(readNeedEvents().length ? '브라우저가 삭제를 허용하지 않았습니다.' : '현재 읽을 수 있는 v5.1 기록이 없습니다.'); }}>삭제하기</button><button onClick={() => setConfirm(false)}>취소</button></div></div>}<p role="status">{message}</p><div className="nf-audit-stats"><article><span>랜딩 → 시작 버튼</span><strong>{!loaded || metrics.startRate === null ? '—' : `${(metrics.startRate * 100).toFixed(1)}%`}</strong><small>{loaded ? `${metrics.started} / ${metrics.exposed}개 방문` : '기록을 불러오세요'}</small></article><article><span>지원 정보를 연 방문</span><strong>{loaded ? metrics.supportJourneys : '—'}</strong><small>외부 상담 이용 여부는 미확인</small></article><article><span>인터뷰 안내를 연 방문</span><strong>{loaded ? metrics.interestJourneys : '—'}</strong><small>관심 클릭이며 신청 완료가 아님</small></article></div><div className="nf-audit-table"><table><thead><tr><th>이벤트</th><th>방문 ID 수</th><th>발생 수</th></tr></thead><tbody>{EVENT_NAMES.map(name => { const rows = filtered.filter(event => event.name === name); return <tr key={name}><td>{name}</td><td>{loaded ? new Set(rows.map(event => event.journeyId)).size : '—'}</td><td>{loaded ? rows.length : '—'}</td></tr>; })}</tbody></table></div><p>분모가 없으면 —로 표시합니다. 선택지는 서로 다른 경로이며 하나의 선형 퍼널로 합산하지 않습니다. 기록은 최대 2,000개이며 브라우저 삭제·저장 차단·버전 차이 때문에 누락될 수 있습니다.</p><details><summary>선택형 피드백 및 이벤트 상세</summary><pre>{JSON.stringify(filtered, null, 2)}</pre></details><p><Link href="/review">이전 v4 실험 기록 보기 →</Link></p></main></div>;
}
