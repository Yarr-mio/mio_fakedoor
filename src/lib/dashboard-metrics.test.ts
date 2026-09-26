import { describe, it, expect } from 'vitest';
import { capacity, dashboardMetrics, EVIDENCE_ITEMS, emptyLedger, evidenceVerdict, kstDay, parseDashboardEvents, parseLedger } from './dashboard-metrics';
import type { NeedEvent, NeedEventName } from './need-events';
const event=(name:NeedEventName, id:string, journeyId='visit', minute=0):NeedEvent=>({name,id,journeyId,at:`2026-09-15T15:${String(minute).padStart(2,'0')}:00Z`,version:'need-flow-v5.2',mode:'scripted_demo',internal:false,props:{}});
const filter={start:'',end:'',internal:false};
describe('dashboard evidence boundaries',()=>{
  it('deduplicates IDs, rejects other modes/invalid times and strips free text',()=>{
    const row={...event('landing_viewed','a'),props:{message:'private narrative',need:'listen',rating:'private@example.com'}};
    const result=parseDashboardEvents({events:[row,row,{...row,id:'b',at:'invalid'},{...row,id:'c',mode:'live'}]});
    expect(result).toMatchObject({rejected:2,duplicates:1});expect(result.events).toHaveLength(1);expect(result.events[0].props).toEqual({need:'listen'});
    expect(()=>parseDashboardEvents({bad:1})).toThrow();
  });
  it('joins ordered stages only within the same journey and excludes team traffic',()=>{
    const rows=[event('entry_clicked','b','v',2),event('landing_viewed','a','v',1),event('notice_acknowledged','c','v',3),event('demo_started','d','v',4),event('mock_input_sent','e','v',5),event('mock_input_sent','f','v',6),event('demo_started','orphan','other'),{...event('landing_viewed','team'),internal:true},event('entry_clicked','early','reverse',1),event('landing_viewed','late','reverse',2)];
    const m=dashboardMetrics(rows,filter);expect(m.funnel.map(x=>x.count)).toEqual([2,1,1,1]);expect(m.typed).toBe(1);expect(m.orphanJourneys).toBe(1);expect(m.journeys).toBe(3);
  });
  it('uses KST inclusive dates and exposes period-boundary missing stages',()=>{
    expect(kstDay('2026-09-15T15:00:00Z')).toBe('2026-09-16');
    const rows=[{...event('landing_viewed','a'),at:'2026-09-15T14:59:59Z'},event('entry_clicked','b')];
    const m=dashboardMetrics(rows,{...filter,start:'2026-09-16',end:'2026-09-16'});expect(m.funnel.map(x=>x.count)).toEqual([0,0,0,0]);expect(m.orphanJourneys).toBe(1);
  });
  it('counts latest feedback per visit and retains unknown/negative responses',()=>{
    const m=dashboardMetrics([{...event('feedback_submitted','a','one',1),props:{rating:'easy'}},{...event('feedback_submitted','b','one',2),props:{rating:'difficult'}},{...event('feedback_submitted','c','two',3),props:{rating:'unknown'}}],filter);
    expect(m.feedback).toEqual({difficult:1,unknown:1});
  });
  it('keeps PMF undecided for missing, mock, mixed or interview-only retention evidence',()=>{
    const ledger=emptyLedger();expect(evidenceVerdict(ledger).label).toBe('판단 보류');
    for(const x of EVIDENCE_ITEMS)ledger[x.id]={status:'support',source:'mock',reference:'E1',note:'mock review'};
    expect(evidenceVerdict(ledger).usable).toBe(0);
    for(const x of EVIDENCE_ITEMS)ledger[x.id].source='interview';
    expect(evidenceVerdict(ledger).label).toBe('판단 보류');
    for(const x of EVIDENCE_ITEMS)ledger[x.id].source='live';
    expect(evidenceVerdict(ledger).label).toBe('가치 신호 · 추가 검증');
    ledger.value.status='mixed';expect(evidenceVerdict(ledger).label).toBe('판단 보류');
    ledger.value.status='against';expect(evidenceVerdict(ledger).label).toBe('가설 수정 검토');
    ledger.value.reference='';expect(evidenceVerdict(ledger).label).toBe('판단 보류');
  });
  it('does not trust malformed stored review labels',()=>{expect(parseLedger({value:{status:'PMF',source:'live'}})).toEqual(emptyLedger());});
  it('computes CC with fractional churn and handles zero/invalid/extreme inputs',()=>{
    expect(capacity(10,5,100)).toMatchObject({ceiling:200,net:5});expect(capacity(10,5,100)?.projection[1]).toBe(105);
    expect(capacity(0,10,100)).toMatchObject({ceiling:0,net:-10});expect(capacity(10,0,100)?.ceiling).toBeNull();
    expect(capacity(1,101,10)).toBeNull();expect(capacity(-1,10,1)).toBeNull();expect(capacity(NaN,10,1)).toBeNull();expect(capacity(1e308,1e-308,1)).toBeNull();
  });
});
