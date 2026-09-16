// Aggregate import only; contains no user IDs or conversation text.
export type Cohort = { weekStart:string; size:number; retained:(number|null)[] };
export type CohortReport = { version:'mio-cohort-v1'; mode:'live_aggregate'; timezone:'Asia/Seoul'; asOf:string; coreAction:string; sourceRef:string; teamExcluded:true; cohorts:Cohort[] };
const DAY=86400000;
function date(value:unknown) {return typeof value==='string' && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value);}
export function parseCohorts(value:unknown):CohortReport {
  if(!value || typeof value!=='object')throw new Error('코호트 JSON을 확인해주세요.');
  const data=value as CohortReport;
  if(data.version!=='mio-cohort-v1' || data.mode!=='live_aggregate' || data.timezone!=='Asia/Seoul' || data.teamExcluded!==true || !date(data.asOf) || !Array.isArray(data.cohorts) || data.cohorts.length>104 || typeof data.coreAction!=='string' || !data.coreAction.trim() || data.coreAction.length>160 || typeof data.sourceRef!=='string' || !data.sourceRef.trim() || data.sourceRef.length>160)throw new Error('버전·기준일·핵심 행동·출처·팀 제외 설정을 확인해주세요.');
  // asOf is the exclusive cutoff at midnight KST. Use only completed calendar weeks.
  const cutoff=Date.parse(data.asOf); const seen=new Set<string>();
  const cohorts=data.cohorts.map(row=>{
    if(!date(row.weekStart) || new Date(row.weekStart).getUTCDay()!==1 || seen.has(row.weekStart) || !Number.isSafeInteger(row.size) || row.size<1 || row.size>1e9 || !Array.isArray(row.retained) || row.retained.length<1 || row.retained.length>13)throw new Error('코호트 시작은 중복 없는 월요일이며, 크기는 양수이고 W0–W12만 지원합니다.');
    seen.add(row.weekStart);
    const retained=row.retained.map((count,period)=>{
      const mature=Date.parse(row.weekStart)+(period+1)*7*DAY<=cutoff;
      if(count===null)return null;
      if(!mature || !Number.isSafeInteger(count) || count<0 || count>row.size)throw new Error('미성숙 기간은 null, 성숙 기간은 0부터 코호트 크기 사이의 값이어야 합니다.');
      if(period===0 && count!==row.size)throw new Error('W0는 첫 핵심 행동 코호트 전체와 같아야 합니다.');
      return count;
    });
    return {weekStart:row.weekStart,size:row.size,retained};
  });
  return {version:data.version,mode:data.mode,timezone:data.timezone,asOf:data.asOf,coreAction:data.coreAction,sourceRef:data.sourceRef,teamExcluded:true,cohorts:cohorts.sort((a,b)=>a.weekStart.localeCompare(b.weekStart))};
}
export function cohortTotals(report:CohortReport) {
  return Array.from({length:Math.max(0,...report.cohorts.map(row=>row.retained.length))},(_,period)=>{
    const rows=report.cohorts.filter(row=>typeof row.retained[period]==='number');
    return {period,denominator:rows.reduce((n,row)=>n+row.size,0),retained:rows.reduce((n,row)=>n+(row.retained[period] as number),0)};
  });
}
export const COHORT_TEMPLATE: CohortReport = {version:'mio-cohort-v1',mode:'live_aggregate',timezone:'Asia/Seoul',asOf:'2026-09-14',coreAction:'실측 핵심 행동 정의로 교체',sourceRef:'실측 집계 출처 ID로 교체',teamExcluded:true,cohorts:[]};
