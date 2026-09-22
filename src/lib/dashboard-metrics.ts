import { EVENT_NAMES, type NeedEvent, type NeedEventName } from './need-events';

export function parseDashboardEvents(value: unknown) {
  const rows = Array.isArray(value) ? value : (value as { events?: unknown })?.events;
  if (!Array.isArray(rows) || rows.length > 50000) throw new Error('최대 50,000개 이벤트가 있는 v5.2 JSON만 읽을 수 있습니다.');
  const events: NeedEvent[] = []; let rejected = 0; let duplicates = 0;
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || row.version !== 'need-flow-v5.2' || row.mode !== 'scripted_demo' || !EVENT_NAMES.includes(row.name) || typeof row.id !== 'string' || !/^[\w-]{1,100}$/.test(row.id) || typeof row.journeyId !== 'string' || !/^[\w-]{1,100}$/.test(row.journeyId) || typeof row.internal !== 'boolean' || typeof row.at !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(row.at) || !Number.isFinite(Date.parse(row.at))) { rejected++; continue; }
    if (ids.has(row.id)) { duplicates++; continue; }
    ids.add(row.id);
    // Do not carry arbitrary imported props/free text into exports or the UI.
    const props: NeedEvent['props'] = {};
    for (const key of ['screen', 'need', 'resource', 'rating'] as const) {
      if (typeof row.props?.[key] === 'string' && /^[a-z0-9_-]{1,64}$/.test(row.props[key])) props[key] = row.props[key];
    }
    for (const key of ['option', 'turn'] as const) if (Number.isSafeInteger(row.props?.[key]) && row.props[key] >= 0 && row.props[key] <= 10000) props[key] = row.props[key];
    events.push({ id: row.id, journeyId: row.journeyId, at: row.at, version: row.version, mode: row.mode, internal: row.internal, name: row.name, props });
  }
  return { events: events.sort((a,b) => Date.parse(a.at) - Date.parse(b.at)), rejected, duplicates };
}
export function kstDay(at: string) { return new Date(Date.parse(at) + 9 * 3600000).toISOString().slice(0,10); }
export const FUNNEL: { name: NeedEventName; label: string }[] = [
  { name: 'landing_viewed', label: '홈 노출' }, { name: 'entry_clicked', label: '시작 버튼' },
  { name: 'notice_acknowledged', label: '동의 화면 통과' }, { name: 'demo_started', label: '대화 화면 진입' },
];
export function dashboardMetrics(events: NeedEvent[], filter: { start: string; end: string; internal: boolean }) {
  const scoped = events.filter(e => (filter.internal || !e.internal) && (!filter.start || kstDay(e.at) >= filter.start) && (!filter.end || kstDay(e.at) <= filter.end)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const groups = new Map<string, NeedEvent[]>();
  for (const e of scoped) {
    const group=groups.get(e.journeyId);
    if(group) group.push(e); else groups.set(e.journeyId,[e]);
  }
  const count = (name: NeedEventName) => [...groups.values()].filter(rows=>rows.some(e=>e.name===name)).length;
  const ordered = (steps: NeedEventName[]) => [...groups.values()].filter(rows=>{
    let index = 0;
    for (const e of rows) if(e.name === steps[index]) index++;
    return index === steps.length;
  }).length;
  const funnel = FUNNEL.map((stage,index)=>({ ...stage, count: ordered(FUNNEL.slice(0,index+1).map(x=>x.name)) }));
  const latest = (name: NeedEventName, key: 'need'|'rating') => {
    const result: Record<string,number> = Object.create(null);
    for(const rows of groups.values()) {
      const matches = rows.filter(e=>e.name===name); const value = matches[matches.length-1]?.props[key];
      if(value) result[value] = (result[value] ?? 0)+1;
    }
    return result;
  };
  const daily: Record<string,{events:number;visits:Set<string>}> = {};
  for(const event of scoped) { const day=kstDay(event.at); daily[day] ??= {events:0,visits:new Set()}; daily[day].events++; daily[day].visits.add(event.journeyId); }
  return { scoped, journeys:groups.size, count, funnel, typed:ordered(['demo_started','mock_input_sent']), fixtures:ordered(['demo_started','mock_fixture_sent']), feedback:latest('feedback_submitted','rating'), needs:latest('need_selected','need'), followup:latest('followup_choice','rating'), orphanJourneys:[...groups.values()].filter(rows=>!rows.some(e=>e.name==='landing_viewed')).length, daily:Object.entries(daily).map(([day,data])=>({day,events:data.events,journeys:data.visits.size})) };
}

export function capacity(inflow: number, churnPercent: number, active: number) {
  if (![inflow,churnPercent,active].every(Number.isFinite) || inflow<0 || churnPercent<0 || churnPercent>100 || active<0) return null;
  const churn = churnPercent/100; const projection = [active];
  for(let i=0;i<12;i++) projection.push(projection[i]*(1-churn)+inflow);
  if (!projection.every(Number.isFinite) || (churn>0 && !Number.isFinite(inflow/churn))) return null;
  return { ceiling:churn>0?inflow/churn:null, net:inflow-churn*active, projection };
}

export const EVIDENCE_ITEMS = [
  { id:'moment', title:'대상과 순간', question:'어떤 상황에서, 기존 대안 대신 선택했는가?' },
  { id:'value', title:'실제 대화의 가치', question:'실제 사용에서 도움·도움 없음·불편을 함께 관찰했는가?' },
  { id:'return', title:'반복 사용', question:'동일 사용자와 충분한 관찰 기간으로 실제 재사용을 확인했는가?' },
  { id:'retention', title:'유지와 이탈', question:'같은 정의의 성숙한 코호트에서 유지·이탈을 관찰했는가?' },
  { id:'quality', title:'자료의 신뢰도', question:'실제 사용자·대상 적합성·누락·중복·관찰 기간을 확인했는가?' },
] as const;
export type EvidenceId = typeof EVIDENCE_ITEMS[number]['id'];
export type EvidenceRow = { status:'unknown'|'support'|'mixed'|'against'; source:'unknown'|'mock'|'interview'|'live'; reference:string; note:string };
export type EvidenceLedger = Record<EvidenceId,EvidenceRow>;
export function emptyLedger(): EvidenceLedger { return Object.fromEntries(EVIDENCE_ITEMS.map(x=>[x.id,{status:'unknown',source:'unknown',reference:'',note:''}])) as EvidenceLedger; }
export function parseLedger(value: unknown): EvidenceLedger {
  const result=emptyLedger();
  if(!value || typeof value!=='object') return result;
  for(const item of EVIDENCE_ITEMS) {
    const row=(value as Record<string,Partial<EvidenceRow>>)[item.id];
    if(row && ['unknown','support','mixed','against'].includes(row.status ?? '') && ['unknown','mock','interview','live'].includes(row.source ?? '') && typeof row.reference==='string' && typeof row.note==='string') result[item.id]={status:row.status!,source:row.source!,reference:row.reference.slice(0,160),note:row.note.slice(0,500)};
  }
  return result;
}
export function evidenceVerdict(ledger: EvidenceLedger) {
  const assessed = EVIDENCE_ITEMS.filter(item=>{const row=ledger[item.id];return row.status!=='unknown' && row.source!=='unknown' && row.reference.trim() && row.note.trim();});
  // A scripted demo cannot establish real product value, return, or retention.
  const usable = assessed.filter(item=>ledger[item.id].source!=='mock' && (!['value','return','retention'].includes(item.id) || ledger[item.id].source==='live'));
  const against = usable.some(item=>ledger[item.id].status==='against');
  const positive = usable.length===EVIDENCE_ITEMS.length && usable.every(item=>ledger[item.id].status==='support');
  return { assessed:assessed.length, usable:usable.length, label:against?'가설 수정 검토':positive?'가치 신호 · 추가 검증':'판단 보류', reason:against?'반대 근거가 있습니다. 해당 상황과 범위를 검토하세요. PMF 부재의 확정은 아닙니다.':positive?'담당자가 입력한 근거에 지지 신호가 있습니다. 원자료 검증과 반복 관찰이 필요하며 PMF 확정이 아닙니다.':'실제 가치·재사용·유지 근거가 부족하거나 혼합되어 있습니다. UNKNOWN을 실패로 바꾸지 않습니다.' };
}
