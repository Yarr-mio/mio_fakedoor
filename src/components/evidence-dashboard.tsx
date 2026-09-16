'use client';
import Link from 'next/link';

import { useEffect, useMemo, useState } from 'react';
import { COHORT_TEMPLATE, cohortTotals, parseCohorts, type CohortReport } from '@/lib/retention-cohorts';
import { readNeedEvents, type NeedEvent } from '@/lib/need-events';
import { capacity, dashboardMetrics, EVIDENCE_ITEMS, emptyLedger, evidenceVerdict, parseDashboardEvents, parseLedger, type EvidenceId, type EvidenceLedger } from '@/lib/dashboard-metrics';

const LEDGER_KEY = 'mio_admin_evidence_v1';
const NEEDS: Record<string,string> = { listen:'이야기하기', organize:'정리하기', perspective:'다른 관점', support:'지원 정보', unsure:'모르겠음' };
const pct = (n:number,d:number) => d ? `${(n/d*100).toFixed(1)}%` : '—';
const number = (n:number) => new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(n);
function download(name:string,value:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function EvidenceDashboard() {
  const [authorized,setAuthorized]=useState(false);
  const [cohorts,setCohorts]=useState<CohortReport|null>(null);
  const [events,setEvents]=useState<NeedEvent[]>([]); const [loaded,setLoaded]=useState(false);
  const [source,setSource]=useState('자료를 불러오세요'); const [quality,setQuality]=useState({rejected:0,duplicates:0});
  const [start,setStart]=useState(''); const [end,setEnd]=useState(''); const [internal,setInternal]=useState(false);
  const [message,setMessage]=useState(''); const [ledger,setLedger]=useState<EvidenceLedger>(emptyLedger);
  const [inflow,setInflow]=useState(''); const [churn,setChurn]=useState(''); const [active,setActive]=useState(''); const [unit,setUnit]=useState('주');
  useEffect(()=>{
    let disposed=false;
    async function check() {
      try {const response=await fetch('/api/admin/session',{cache:'no-store'});if(!response.ok){window.location.replace('/admin/login');return;}if(!disposed)setAuthorized(true);}
      catch {if(!disposed)setAuthorized(false);}
    }
    void check(); const interval=setInterval(check,60000);
    const visible=()=>{if(document.visibilityState==='visible')void check();};
    document.addEventListener('visibilitychange',visible); window.addEventListener('pageshow',visible);
    return ()=>{disposed=true;clearInterval(interval);document.removeEventListener('visibilitychange',visible);window.removeEventListener('pageshow',visible);};
  },[]);
  const metrics=useMemo(()=>dashboardMetrics(events,{start,end,internal}),[events,start,end,internal]);
  const verdict=evidenceVerdict(ledger);
  const estimate=[inflow,churn,active].every(x=>x.trim()!=='')?capacity(Number(inflow),Number(churn),Number(active)):null;
  const feedbackTotal=Object.values(metrics.feedback).reduce((a,b)=>a+b,0);
  const followupTotal=Object.values(metrics.followup).reduce((a,b)=>a+b,0);
  async function importCohorts(file:File|undefined) {
    if(!file)return;
    if(file.size>1024*1024){setMessage('코호트 JSON은 1MB 이하만 지원합니다.');return;}
    try {setCohorts(parseCohorts(JSON.parse(await file.text())));setMessage('수동 집계 자료를 읽었습니다. 원자료 검증이나 사용자 중복 검증이 완료된 것은 아닙니다.');}
    catch(error){setMessage(error instanceof Error?error.message:'코호트 JSON을 확인해주세요.');}
  }
  function loadLocal() {
    try {const parsed=parseDashboardEvents(readNeedEvents());setEvents(parsed.events);setQuality(parsed);setLoaded(true);setSource('이 브라우저 · v5.2');setMessage('로컬 기록을 불러왔습니다. 전체 고객 데이터가 아닙니다.');}
    catch {setMessage('기록을 읽지 못했습니다.');}
  }
  async function importFile(file:File|undefined) {
    if(!file)return;
    if(file.size>5*1024*1024){setMessage('5MB 이하 JSON만 불러올 수 있습니다.');return;}
    try {const parsed=parseDashboardEvents(JSON.parse(await file.text()));setEvents(parsed.events);setQuality(parsed);setLoaded(true);setSource('수동 JSON · 원본 신뢰도 미검증');setMessage(`${parsed.events.length}개 기록을 읽었습니다. 기존 자료와 합치지 않고 교체했습니다.`);}
    catch {setMessage('v5.2 이벤트 JSON 형식과 크기를 확인해주세요.');}
  }
  function update(id:EvidenceId,field:keyof EvidenceLedger[EvidenceId],value:string) {setLedger({...ledger,[id]:{...ledger[id],[field]:value}});}
  function saveLedger() {try {localStorage.setItem(LEDGER_KEY,JSON.stringify({version:1,at:new Date().toISOString(),ledger}));setMessage('이 브라우저에 검토 기록을 저장했습니다. 팀 공유 저장은 아닙니다.');}catch {setMessage('브라우저가 저장을 허용하지 않았습니다. JSON을 내려받아 보관하세요.');}}
  function loadLedger() {try {const saved=JSON.parse(localStorage.getItem(LEDGER_KEY)||'null');setLedger(parseLedger(saved?.ledger));setMessage(saved?'저장된 검토 기록을 불러왔습니다.':'저장된 검토 기록이 없습니다.');}catch {setMessage('검토 기록을 읽지 못했습니다.');}}
  async function logout() {setAuthorized(false);await fetch('/api/admin/session',{method:'DELETE'}).catch(()=>{});window.location.replace('/admin/login');}
  if(!authorized)return <main className="dash-login"><h1>관리자 권한 확인 중</h1><p>연결이 끊기면 대시보드를 숨깁니다.</p><button onClick={()=>window.location.reload()}>다시 확인</button></main>;
  return <div className="dash-shell">
    <header className="dash-top"><Link className="dash-logo" href="/">Mio</Link><span>Evidence workspace</span><nav><a href="/tone-guide">대화 정책</a><a href="/review">이전 v4 기록</a><button onClick={logout}>로그아웃</button></nav></header>
    <main className="dash-main">
      <section className="dash-hero"><div><p className="dash-eyebrow">FAKE DOOR · TEAM ONLY</p><h1>클릭 다음의 가치를<br/>확인하는 대시보드</h1><p>체험 전환과 실제 제품 근거를 분리해, 지금 판단할 수 있는 범위를 확인합니다.</p></div><aside><span>현재 자동 판단</span><strong>PMF 판단 보류</strong><p>고정 목업 · 사용자 식별·리텐션 미연동<br/>클릭과 화면 평가로 PMF를 확정하지 않습니다.</p></aside></section>
      <nav className="dash-tabs" aria-label="대시보드 구역"><a href="#traffic">01 체험 전환</a><a href="#evidence">02 근거 판단</a><a href="#capacity">03 성장 가정</a><a href="#guide">04 읽는 순서</a></nav>
      <section className="dash-panel dash-toolbar" aria-label="자료와 필터"><div><strong>{source}</strong><small>서버 전송 없음 · 업로드 자료도 이 화면에서만 계산</small></div><div className="dash-actions"><button onClick={loadLocal}>로컬 기록 불러오기</button><label className="dash-file">JSON 가져오기<input type="file" accept=".json,application/json" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label><button disabled={!loaded} onClick={()=>download('mio-dashboard-events.json',{version:'need-flow-v5.2',source,filters:{start,end,internal},exportedAt:new Date().toISOString(),events:metrics.scoped})}>필터 기록 내보내기</button></div><div className="dash-filters"><label>시작일 · 한국시간<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>종료일 · 한국시간<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><label className="dash-check"><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/>팀 테스트 포함</label></div>{start&&end&&start>end&&<p className="dash-warning">시작일이 종료일보다 늦습니다. 기간을 수정해주세요.</p>}</section>
      <p className="dash-status" role="status">{message}</p>
      <section id="traffic"><div className="dash-section-heading"><span>01</span><div><h2>체험 전환과 사용 편의</h2><p>고유 사람 수가 아닌 방문 ID 단위입니다. 새로고침·재접속 시 ID가 바뀝니다.</p></div></div>
        <div className="dash-kpis">{[['필터 내 방문 ID',metrics.journeys,'실제 사용자 수 아님'],['대화 후 직접 입력',metrics.typed,'내용·자기노출 여부 미확인'],['대화 후 예시 전송',metrics.fixtures,'창작 문장 선택'],['인터뷰 문의 링크',metrics.count('interview_contact_opened'),'전송·신청 완료 미확인']].map(([label,value,note])=><article key={String(label)}><span>{label}</span><strong>{loaded?value:'—'}</strong><small>{note}</small></article>)}</div>
        {!loaded&&<p className="dash-empty">아직 자료를 불러오지 않았습니다. 수치 없음은 성과 0을 뜻하지 않습니다.</p>}
        <div className="dash-grid"><article className="dash-panel"><h3>진입 과정의 병목</h3><p>같은 방문 ID에서 순서대로 발생한 단계만 연결합니다.</p>{metrics.funnel.map((stage,index)=>{const denominator=index?metrics.funnel[index-1].count:stage.count;return <div className="dash-funnel-row" key={stage.name}><div><span>{stage.label}</span><strong>{loaded?`${stage.count} / ${denominator}`:'—'}</strong><small>{loaded?pct(stage.count,denominator):'—'}</small></div><div className="dash-track"><span style={{width:`${metrics.funnel[0].count?stage.count/metrics.funnel[0].count*100:0}%`}}/></div></div>;})}<small>동의 화면 통과는 실제 동의 저장이 아닙니다. 지원 정보 직행은 별도 경로로 보며 대화 이탈로 판정하지 않습니다.</small><p>지원 정보 열람: {loaded?metrics.count('support_opened'):'—'}개 방문 ID</p></article>
        <article className="dash-panel"><h3>원한 도움과 종료 후 선택</h3><p>방문별 마지막 필요 선택 / 마지막 후속 선택을 각각 집계합니다.</p><div className="dash-stat-list">{Object.entries(NEEDS).map(([key,label])=><div key={key}><span>{label}</span><b>{loaded?(metrics.needs[key]??0):'—'}</b></div>)}</div><hr/><div className="dash-stat-list">{[['perspective','다른 관점·정보 필요'],['existing','기존 방법으로 충분'],['none','더 필요한 것 없음']].map(([key,label])=><div key={key}><span>{label}</span><b>{loaded?`${metrics.followup[key]??0} / ${followupTotal}`:'—'}</b></div>)}</div><small>자발적 응답자 기준입니다. 기존 대안 선택을 AI 거절이나 위해로 해석하지 않습니다.</small></article></div>
        <div className="dash-grid"><article className="dash-panel"><h3>편의 평가 · 부정 신호도 함께</h3><p>질문: 원하는 도움을 찾고 이동하기 편했나요?</p><div className="dash-stat-list">{[['easy','편했어요'],['unknown','잘 모르겠어요'],['difficult','불편했어요']].map(([key,label])=><div key={key}><span>{label}</span><b>{loaded?`${metrics.feedback[key]??0} / ${feedbackTotal}`:'—'}</b></div>)}</div><small>동일 방문의 마지막 응답만 집계합니다. 실제 AI 도움·임상 결과가 아닙니다.</small><p>조용히 종료: {loaded?metrics.count('conversation_ended_quietly'):'—'}개 방문 ID · 중단은 위해의 증거가 아닙니다.</p></article><article className="dash-panel"><h3>자료 품질과 아직 모르는 것</h3><ul><li>중복 이벤트 제거 {quality.duplicates}개 / 잘못된 행 제외 {quality.rejected}개</li><li>필터 구간 내 홈 노출 없는 방문 {metrics.orphanJourneys}개</li><li>로컬 기록 최대 2,000개. 누락·저장 차단·기간 경계 영향 가능</li><li>실제 사용자·유입 채널·D1/D3/W1·이탈률: 미계측</li><li>직접 입력 내용, 실제 도움, 상담 연결 완료: 미확인</li></ul><p className="dash-warning">mock_response_failed는 개발용 실패 상태를 포함합니다. 실제 모델 장애율·위해율이 아닙니다.</p></article></div>
        <details className="dash-panel"><summary>일별 기록 · 방문 ID 수는 DAU가 아닙니다</summary><div className="dash-table-wrap"><table><thead><tr><th>날짜 · 한국시간</th><th>방문 ID</th><th>이벤트</th></tr></thead><tbody>{metrics.daily.map(row=><tr key={row.day}><td>{row.day}</td><td>{row.journeys}</td><td>{row.events}</td></tr>)}</tbody></table></div></details>
      </section>
      <section id="evidence"><div className="dash-section-heading"><span>02</span><div><h2>PMF 근거 검토</h2><p>팀의 수동 검토 기록입니다. 원자료의 진위를 자동 확인하거나 PMF를 인증하지 않습니다.</p></div></div><div className="dash-verdict"><div><small>담당자 입력에 따른 검토 제안</small><h3>{verdict.label}</h3><p>{verdict.reason}</p></div><strong>{verdict.usable} / 5<small>출처 유형·기입 조건 충족</small></strong></div><p>고객 이름·연락처·대화 원문은 적지 마세요. 익명 근거 ID와 집계된 관찰만 기록합니다. 모의 대화는 실제 가치·재사용 근거로 승격하지 않습니다.</p>
        <div className="dash-evidence-list">{EVIDENCE_ITEMS.map(item=><article className="dash-panel" key={item.id}><div><h3>{item.title}</h3><p>{item.question}</p></div><div className="dash-evidence-fields"><label>근거 방향<select value={ledger[item.id].status} onChange={e=>update(item.id,'status',e.target.value)}><option value="unknown">미확인</option><option value="support">지지</option><option value="mixed">혼합·상충</option><option value="against">반대</option></select></label><label>자료 유형<select value={ledger[item.id].source} onChange={e=>update(item.id,'source',e.target.value)}><option value="unknown">미정</option><option value="mock">목업 체험</option><option value="interview">인터뷰·자기보고</option><option value="live">실제 사용 관찰</option></select></label><label>근거 ID·기간<input maxLength={160} placeholder="예: 집계 E-01 · W1 · n=…" value={ledger[item.id].reference} onChange={e=>update(item.id,'reference',e.target.value)}/></label><label className="dash-note">관찰·반례·한계<textarea maxLength={500} rows={2} placeholder="분자/분모, 대상·기간, 반례와 아직 모르는 점" value={ledger[item.id].note} onChange={e=>update(item.id,'note',e.target.value)}/></label></div></article>)}</div><div className="dash-actions"><button onClick={saveLedger}>검토 기록 저장</button><button onClick={loadLedger}>저장 기록 불러오기</button><button onClick={()=>download('mio-evidence-review.json',{version:1,at:new Date().toISOString(),source:'manual_unverified',verdict,ledger})}>검토 JSON 내보내기</button></div><small>브라우저별 저장이며 팀 공동 편집·서버 보관은 아직 연결되지 않았습니다.</small>
      </section>
      <section className="dash-panel"><h2>실사용 코호트 · 별도 집계 자료</h2><p>첫 핵심 행동을 한 주의 사용자 중, 이후 각 주에 같은 행동을 다시 한 비율입니다. 목업 방문 ID로 계산하지 않습니다.</p><div className="dash-actions"><button onClick={()=>download('mio-cohort-template.json',COHORT_TEMPLATE)}>빈 집계 양식 받기</button><label className="dash-file">코호트 JSON 가져오기<input type="file" accept=".json,application/json" onChange={e=>{void importCohorts(e.target.files?.[0]);e.target.value='';}}/></label>{cohorts&&<button onClick={()=>setCohorts(null)}>불러온 집계 닫기</button>}</div>{!cohorts?<p className="dash-empty">실사용 집계 미연동 · 리텐션은 UNKNOWN입니다.</p>:<><p><strong>수동 집계 · 진위 미검증</strong><br/>기준: {cohorts.asOf} 00:00 KST 이전 / 핵심 행동: {cohorts.coreAction}<br/>출처: {cohorts.sourceRef}</p><div className="dash-table-wrap"><table><thead><tr><th>첫 행동 주 · 월요일</th><th>전체 n</th>{cohortTotals(cohorts).map(x=><th key={x.period}>W{x.period}</th>)}</tr></thead><tbody>{cohorts.cohorts.map(row=><tr key={row.weekStart}><td>{row.weekStart}</td><td>{row.size}</td>{cohortTotals(cohorts).map(x=><td key={x.period}>{typeof row.retained[x.period]==='number'?`${pct(row.retained[x.period] as number,row.size)} (${row.retained[x.period]}/${row.size})`:'— 미관찰'}</td>)}</tr>)}<tr><th>관측 가능한 코호트 합계</th><td>기간별 분모</td>{cohortTotals(cohorts).map(x=><td key={x.period}>{x.denominator?`${pct(x.retained,x.denominator)} (${x.retained}/${x.denominator})`:'—'}</td>)}</tr></tbody></table></div></>}<small>W0는 첫 행동 주, W1은 다음 달력 주입니다. D7과 다릅니다. 미성숙·미관찰은 null, 관찰 결과 0은 0으로 구분합니다. 합계는 분모 가중 집계이며 기간별 코호트 구성이 다를 수 있습니다. 작은 표본·짧은 곡선을 Plateau나 PMF로 자동 판정하지 않습니다. 이 표의 1−리텐션을 CC 이탈률에 자동 대입하지 않습니다.</small></section>
      <section id="capacity"><div className="dash-section-heading"><span>03</span><div><h2>Carrying Capacity · 가정 계산</h2><p>첨부 자료의 유입·이탈 모델을 살펴보는 계산기입니다. 실제 Mio 예측값이 아닙니다.</p></div></div><div className="dash-grid"><article className="dash-panel"><h3>같은 기간·같은 활성 정의로 입력</h3><div className="dash-input-grid"><label>계산 주기<select value={unit} onChange={e=>setUnit(e.target.value)}><option>주</option><option>일</option><option>월</option></select></label><label>기간당 유입 I · 명<input type="number" min="0" step="any" value={inflow} onChange={e=>setInflow(e.target.value)} placeholder="신규 + 재활성"/></label><label>기간당 이탈률 c · %<input type="number" min="0" max="100" step="any" value={churn} onChange={e=>setChurn(e.target.value)} placeholder="기초 활성 대비 이탈"/></label><label>현재 활성 N · 명<input type="number" min="0" step="any" value={active} onChange={e=>setActive(e.target.value)} placeholder="같은 활성 정의"/></label></div><p className="dash-formula">N(t+1) = N(t) × (1 − c) + I<br/>균형 규모 = I ÷ c</p><small>신규·재활성은 기초 활성과 중복 없이 정의합니다. 일간 유입과 월간 이탈률을 섞지 않습니다. Paid와 Organic은 따로 계산하세요.</small></article><article className="dash-panel"><span className="dash-tag">가정 시뮬레이션 · 실측 아님</span><h3>조건이 유지될 때의 균형</h3><strong className="dash-capacity">{estimate?.ceiling!==null&&estimate?.ceiling!==undefined?`${number(estimate.ceiling)}명`:'산출 보류'}</strong><p>{estimate?`다음 ${unit} 순증감: ${number(estimate.net)}명`:'모든 입력값과 범위를 확인해주세요.'}</p>{estimate&&estimate.ceiling===null&&<p>이탈률 0%에서는 유일한 유한 균형값을 계산하지 않습니다. 무한 성장이나 PMF로 해석하지 마세요.</p>}<p>유입·이탈률 고정, 같은 집계 주기, 중복 없는 활성 사용자라는 가정입니다. 계절성·유입 구성·제품 변경·네트워크 효과는 별도 검토가 필요합니다.</p><small>PDF p.4, 7, 13–15, 29 참고. 20/40/70%·80% 등 자료 속 수치를 Mio의 합격선으로 사용하지 않습니다.</small></article></div>{estimate&&<details className="dash-panel"><summary>12개 기간 가정 추이 · 예측 성과 아님</summary><div className="dash-table-wrap"><table><thead><tr><th>경과 기간</th><th>가정 활성 규모</th></tr></thead><tbody>{estimate.projection.map((n,i)=><tr key={i}><td>{i}{unit}</td><td>{number(n)}명</td></tr>)}</tbody></table></div></details>}</section>
      <section id="guide" className="dash-panel"><h2>회의에서 읽는 순서</h2><ol><li><strong>자료부터 확인:</strong> 목업/실사용, 대상·채널, 기간, 중복·누락과 분모를 확인합니다.</li><li><strong>진입 병목 확인:</strong> 클릭→대화 진입→입력의 차이를 봅니다. 입력을 자기노출로 간주하지 않습니다.</li><li><strong>남는 이유와 떠나는 이유:</strong> 도움 없음·불편·기존 대안 충분함도 같은 비중으로 검토합니다.</li><li><strong>성숙한 코호트:</strong> 핵심 행동·활성·이탈 기간을 먼저 합의합니다. 관찰 중인 사용자를 이탈자 0%로 만들지 않습니다.</li><li><strong>결정:</strong> 추가 검증 / 병목 수정 / 가설 수정 / 판단 보류를 근거와 함께 남깁니다. CC와 리텐션 하나로 PMF를 확정하지 않습니다.</li></ol><p>아하 모먼트 후보는 미래 정보를 제외한 초기 행동으로 정의하고 이후 잔존을 비교합니다. 상관·SHAP만으로 인과를 주장하거나 특정 행동을 강요하지 않습니다.</p><p>현재 유입 채널·안정적인 사용자 ID·실제 LLM 세션·성숙한 코호트는 BE 연동 과제입니다. 종료·전문 도움 이용은 서비스 목적을 달성한 결과일 수도 있습니다.</p></section>
      <footer className="dash-footer">Mio · 근거 기반 검토 도구 / 관리자 세션은 4시간 후 만료됩니다.</footer>
    </main>
  </div>;
}
