'use client';
import Link from 'next/link';

import { useEffect, useMemo, useState } from 'react';
import { AdminConversationTracePanel } from '@/components/admin-conversation-trace';
import { AdminSafetyQueue } from '@/components/admin-safety-queue';
import {
  adminErrorMessage,
  createAdminApi,
  formatCoverageRate,
  hasAdminAccessToken,
  metricsFromLocalDashboard,
  shouldShowLiveQuality,
  unsetAdminTokenSource,
  type AdminMetricsData,
  type AdminMetricsMode,
  type AdminRole,
  type AdminTokenSource,
} from '@/lib/api/admin';
import { COHORT_TEMPLATE, cohortTotals, parseCohorts, type CohortReport } from '@/lib/retention-cohorts';
import { readNeedEvents, type NeedEvent } from '@/lib/need-events';
import { capacity, dashboardMetrics, EVIDENCE_ITEMS, emptyLedger, evidenceVerdict, parseDashboardEvents, parseLedger, type EvidenceId, type EvidenceLedger } from '@/lib/dashboard-metrics';

const LEDGER_KEY = 'mio_admin_evidence_v1';
const NEEDS: Record<string, string> = { listen: '이야기하기', organize: '정리하기', perspective: '다른 관점', support: '지원 정보', unsure: '모르겠음' };
const pct = (n: number, d: number) => d ? `${(n / d * 100).toFixed(1)}%` : '—';
const number = (n: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(n);

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function kstToday() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

export function EvidenceDashboard({
  tokenSource = unsetAdminTokenSource,
  role = 'viewer',
}: {
  tokenSource?: AdminTokenSource;
  role?: AdminRole;
} = {}) {
  const api = useMemo(() => createAdminApi(tokenSource), [tokenSource]);
  const [authorized, setAuthorized] = useState(false);
  const [cohorts, setCohorts] = useState<CohortReport | null>(null);
  const [cohortNotice, setCohortNotice] = useState('');
  const [events, setEvents] = useState<NeedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState('서버 집계가 기본 소스입니다');
  const [quality, setQuality] = useState({ rejected: 0, duplicates: 0 });
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [internal, setInternal] = useState(false);
  const [mode, setMode] = useState<AdminMetricsMode>('all');
  const [asOf, setAsOf] = useState(kstToday);
  const [coreAction, setCoreAction] = useState('');
  const [serverMetrics, setServerMetrics] = useState<AdminMetricsData | null>(null);
  const [message, setMessage] = useState('');
  const [ledger, setLedger] = useState<EvidenceLedger>(emptyLedger);
  const [inflow, setInflow] = useState('');
  const [churn, setChurn] = useState('');
  const [active, setActive] = useState('');
  const [unit, setUnit] = useState('주');

  useEffect(() => {
    let disposed = false;
    async function check() {
      try {
        const response = await fetch('/api/admin/session', { cache: 'no-store' });
        if (!response.ok) {
          window.location.replace('/admin/login');
          return;
        }
        if (!disposed) setAuthorized(true);
      } catch {
        if (!disposed) setAuthorized(false);
      }
    }
    void check();
    const interval = setInterval(check, 60000);
    const visible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', visible);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', visible);
    };
  }, []);

  const localMetrics = useMemo(() => dashboardMetrics(events, { start, end, internal }), [events, start, end, internal]);
  const view = serverMetrics ?? (loaded ? metricsFromLocalDashboard(localMetrics, { start, end }) : null);
  const verdict = evidenceVerdict(ledger);
  const estimate = [inflow, churn, active].every((x) => x.trim() !== '') ? capacity(Number(inflow), Number(churn), Number(active)) : null;
  const feedbackTotal = Object.values(view?.feedback ?? {}).reduce((a, b) => a + b, 0);
  const followupTotal = Object.values(view?.followup ?? {}).reduce((a, b) => a + b, 0);

  async function loadServerMetrics() {
    if (start && end && start > end) return;
    if (!hasAdminAccessToken(tokenSource.getAccessToken())) {
      setMessage('관리자 토큰이 없어 서버 조회를 건너뜁니다. 로컬 기록은 폴백으로 불러올 수 있습니다.');
      return;
    }
    try {
      const result = await api.getMetrics({
        start: start || undefined,
        end: end || undefined,
        includeInternal: internal,
        mode,
      });
      setServerMetrics(result.data);
      setLoaded(true);
      setSource('서버 집계');
      setMessage('서버 지표를 불러왔습니다. 방문 ID는 사람 수나 DAU가 아닙니다.');
    } catch (error) {
      setMessage(adminErrorMessage(error, 'metrics'));
    }
  }

  async function loadServerCohorts() {
    setCohorts(null);
    setCohortNotice('');
    if (!hasAdminAccessToken(tokenSource.getAccessToken())) {
      setCohortNotice('관리자 토큰이 없어 서버 조회를 건너뜁니다. JSON 가져오기는 폴백입니다.');
      return;
    }
    try {
      const result = await api.getCohorts({ asOf, coreAction });
      setCohorts(result.data);
    } catch (error) {
      setCohortNotice(adminErrorMessage(error, 'cohorts'));
    }
  }

  async function importCohorts(file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setMessage('코호트 JSON은 1MB 이하만 지원합니다.');
      return;
    }
    try {
      setCohorts(parseCohorts(JSON.parse(await file.text())));
      setCohortNotice('');
      setMessage('수동 집계 자료를 읽었습니다. 원자료 검증이나 사용자 중복 검증이 완료된 것은 아닙니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '코호트 JSON을 확인해주세요.');
    }
  }

  function loadLocal() {
    try {
      const parsed = parseDashboardEvents(readNeedEvents());
      setEvents(parsed.events);
      setQuality(parsed);
      setServerMetrics(null);
      setLoaded(true);
      setSource('이 브라우저 · 로컬 폴백');
      setMessage('로컬 기록을 불러왔습니다. 전체 고객 데이터가 아닙니다.');
    } catch {
      setMessage('기록을 읽지 못했습니다.');
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage('5MB 이하 JSON만 불러올 수 있습니다.');
      return;
    }
    try {
      const parsed = parseDashboardEvents(JSON.parse(await file.text()));
      setEvents(parsed.events);
      setQuality(parsed);
      setServerMetrics(null);
      setLoaded(true);
      setSource('수동 JSON · 로컬 폴백');
      setMessage(`${parsed.events.length}개 기록을 읽었습니다. 기존 자료와 합치지 않고 교체했습니다.`);
    } catch {
      setMessage('이벤트 JSON 형식과 크기를 확인해주세요.');
    }
  }

  function update(id: EvidenceId, field: keyof EvidenceLedger[EvidenceId], value: string) {
    setLedger({ ...ledger, [id]: { ...ledger[id], [field]: value } });
  }
  function saveLedger() {
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify({ version: 1, at: new Date().toISOString(), ledger }));
      setMessage('이 브라우저에 검토 기록을 저장했습니다. 팀 공유 저장은 아닙니다.');
    } catch {
      setMessage('브라우저가 저장을 허용하지 않았습니다. JSON을 내려받아 보관하세요.');
    }
  }
  function loadLedger() {
    try {
      const saved = JSON.parse(localStorage.getItem(LEDGER_KEY) || 'null');
      setLedger(parseLedger(saved?.ledger));
      setMessage(saved ? '저장된 검토 기록을 불러왔습니다.' : '저장된 검토 기록이 없습니다.');
    } catch {
      setMessage('검토 기록을 읽지 못했습니다.');
    }
  }
  async function logout() {
    setAuthorized(false);
    await fetch('/api/admin/session', { method: 'DELETE' }).catch(() => {});
    window.location.replace('/admin/login');
  }

  if (!authorized) {
    return (
      <main className="dash-login">
        <h1>관리자 권한 확인 중</h1>
        <p>연결이 끊기면 대시보드를 숨깁니다.</p>
        <button onClick={() => window.location.reload()}>다시 확인</button>
      </main>
    );
  }

  return (
    <div className="dash-shell">
      <header className="dash-top">
        <Link className="dash-logo" href="/">Mio</Link>
        <span>Evidence workspace</span>
        <nav>
          <a href="/tone-guide">대화 정책</a>
          <a href="/review">이전 v4 기록</a>
          <button onClick={logout}>로그아웃</button>
        </nav>
      </header>
      <main className="dash-main">
        <section className="dash-hero">
          <div>
            <p className="dash-eyebrow">FAKE DOOR · TEAM ONLY</p>
            <h1>클릭 다음의 가치를<br />확인하는 대시보드</h1>
            <p>체험 전환과 실제 제품 근거를 분리해, 지금 판단할 수 있는 범위를 확인합니다.</p>
          </div>
        </section>
        <nav className="dash-tabs" aria-label="대시보드 구역">
          <a href="#traffic">01 체험 전환</a>
          <a href="#evidence">02 근거 판단</a>
          <a href="#capacity">03 성장 가정</a>
          <a href="#guide">04 읽는 순서</a>
          <a href="#safety">05 안전 이벤트</a>
          <a href="#conversation-trace">06 판정 추적</a>
        </nav>
        <section className="dash-panel dash-toolbar" aria-label="자료와 필터">
          <div>
            <strong>{source}</strong>
            <small>기본 소스는 서버 집계입니다. 로컬 저장은 폴백입니다.</small>
          </div>
          <div className="dash-actions">
            <button onClick={() => void loadServerMetrics()}>서버 지표 불러오기</button>
            <button onClick={loadLocal}>로컬 기록 불러오기</button>
            <label className="dash-file">JSON 가져오기
              <input type="file" accept=".json,application/json" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button disabled={!view} onClick={() => download('mio-dashboard-events.json', { source, filters: { start, end, internal, mode }, exportedAt: new Date().toISOString(), metrics: view })}>필터 기록 내보내기</button>
          </div>
          <div className="dash-filters">
            <label>시작일 · 한국시간<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>종료일 · 한국시간<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <label>모드
              <select value={mode} onChange={(e) => setMode(e.target.value as AdminMetricsMode)}>
                <option value="all">분리 집계 전체</option>
                <option value="scripted_demo">scripted_demo</option>
                <option value="live">live</option>
              </select>
            </label>
            <label className="dash-check">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              팀 테스트 포함
            </label>
          </div>
          {start && end && start > end && <p className="dash-warning">시작일이 종료일보다 늦습니다. 기간을 수정해주세요.</p>}
        </section>
        <p className="dash-status" role="status">{message}</p>
        <section id="traffic">
          <div className="dash-section-heading">
            <span>01</span>
            <div>
              <h2>체험 전환과 사용 편의</h2>
              <p>고유 사람 수나 DAU가 아닌 방문 ID 단위입니다. 목업과 실사용은 합산하지 않습니다.</p>
            </div>
          </div>
          <div className="dash-kpis">
            {[
              ['필터 내 방문 ID', view?.journeys, '사람 수 아님 · DAU 아님'],
              ['목업 scripted_demo', view?.byMode.scripted_demo, '실사용과 합산하지 않음'],
              ['실사용 live', view?.byMode.live, '목업과 합산하지 않음'],
              ['대화 후 직접 입력', view?.typed, '내용·자기노출 여부 미확인'],
            ].map(([label, value, note]) => (
              <article key={String(label)}>
                <span>{label}</span>
                <strong>{view ? value : '—'}</strong>
                <small>{note}</small>
              </article>
            ))}
          </div>
          {!view && <p className="dash-empty">아직 자료를 불러오지 않았습니다. 수치 없음은 성과 0을 뜻하지 않습니다.</p>}
          <div className="dash-grid">
            <article className="dash-panel">
              <h3>진입 과정의 병목</h3>
              <p>같은 방문 ID에서 순서대로 발생한 단계만 연결합니다.</p>
              {(view?.funnel ?? []).map((stage, index, funnel) => {
                const denominator = index ? funnel[index - 1].count : stage.count;
                return (
                  <div className="dash-funnel-row" key={stage.name}>
                    <div>
                      <span>{stage.label}</span>
                      <strong>{view ? `${stage.count} / ${denominator}` : '—'}</strong>
                      <small>{view ? pct(stage.count, denominator) : '—'}</small>
                    </div>
                    <div className="dash-track">
                      <span style={{ width: `${funnel[0]?.count ? stage.count / funnel[0].count * 100 : 0}%` }} />
                    </div>
                  </div>
                );
              })}
              <small>동의 화면 통과는 실제 동의 저장이 아닙니다. 지원 정보 직행은 별도 경로로 보며 대화 이탈로 판정하지 않습니다.</small>
            </article>
            <article className="dash-panel">
              <h3>원한 도움과 종료 후 선택</h3>
              <p>방문별 마지막 필요 선택 / 마지막 후속 선택을 각각 집계합니다.</p>
              <div className="dash-stat-list">
                {Object.entries(NEEDS).map(([key, label]) => (
                  <div key={key}><span>{label}</span><b>{view ? (view.needs[key] ?? 0) : '—'}</b></div>
                ))}
              </div>
              <hr />
              <div className="dash-stat-list">
                {[['perspective', '다른 관점·정보 필요'], ['existing', '기존 방법으로 충분'], ['none', '더 필요한 것 없음']].map(([key, label]) => (
                  <div key={key}><span>{label}</span><b>{view ? `${view.followup[key] ?? 0} / ${followupTotal}` : '—'}</b></div>
                ))}
              </div>
              <small>자발적 응답자 기준입니다. 기존 대안 선택을 AI 거절이나 위해로 해석하지 않습니다.</small>
            </article>
          </div>
          <div className="dash-grid">
            <article className="dash-panel">
              <h3>편의 평가 · 부정 신호도 함께</h3>
              <p>질문: 원하는 도움을 찾고 이동하기 편했나요?</p>
              <div className="dash-stat-list">
                {[['easy', '편했어요'], ['unknown', '잘 모르겠어요'], ['difficult', '불편했어요']].map(([key, label]) => (
                  <div key={key}><span>{label}</span><b>{view ? `${view.feedback[key] ?? 0} / ${feedbackTotal}` : '—'}</b></div>
                ))}
              </div>
              <small>동일 방문의 마지막 응답만 집계합니다. 실제 AI 도움·임상 결과가 아닙니다.</small>
              <p>대화 후 예시 전송 {view ? view.fixtures : '—'} · 홈 노출 없는 방문 {view ? view.orphanJourneys : '—'}</p>
            </article>
            <article className="dash-panel">
              <h3>자료 품질과 아직 모르는 것</h3>
              <ul>
                <li>중복 이벤트 제거 {quality.duplicates}개 / 잘못된 행 제외 {quality.rejected}개 · 로컬 폴백에만 해당</li>
                <li>이벤트 손실률 {view ? formatCoverageRate(view.coverage.eventLossRate) : '—'}</li>
                <li>판정 미해결률 {view ? formatCoverageRate(view.coverage.judgeUnresolvedRate) : '—'} · 미측정이 정상입니다</li>
                <li>중도 이탈률 {view ? formatCoverageRate(view.coverage.abandonedRate) : '—'}</li>
                <li>null은 측정 안 됨이며 0으로 바꾸지 않습니다</li>
              </ul>
            </article>
          </div>
          {view && shouldShowLiveQuality(view.liveQuality) && (
            <article className="dash-panel">
              <h3>live 운영 품질</h3>
              <p>live 대화만 대상입니다. 목업과 합산하지 않습니다.</p>
              <div className="dash-stat-list">
                <div><span>후속 불일치율</span><b>{formatCoverageRate(view.liveQuality.followUpMismatchRate)}</b></div>
                <div><span>질문 비율</span><b>{formatCoverageRate(view.liveQuality.inquiryRatio)}</b></div>
                <div><span>교체율</span><b>{formatCoverageRate(view.liveQuality.replacedRate)}</b></div>
                <div><span>위기 흐름</span><b>{view.liveQuality.crisisFlowCount}</b></div>
                <div><span>턴 상한</span><b>{view.liveQuality.turnLimitCount}</b></div>
              </div>
            </article>
          )}
          <details className="dash-panel">
            <summary>일별 기록 · 방문 ID 수는 DAU가 아닙니다</summary>
            <div className="dash-table-wrap">
              <table>
                <thead><tr><th>날짜 · 한국시간</th><th>방문 ID</th><th>이벤트</th></tr></thead>
                <tbody>
                  {(view?.daily ?? []).map((row) => (
                    <tr key={row.day}><td>{row.day}</td><td>{row.journeys}</td><td>{row.events}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section id="evidence">
          <div className="dash-section-heading">
            <span>02</span>
            <div>
              <h2>PMF 근거 검토</h2>
              <p>팀의 수동 검토 기록입니다. 원자료의 진위를 자동 확인하거나 PMF를 인증하지 않습니다.</p>
            </div>
          </div>
          <div className="dash-verdict">
            <div>
              <small>담당자 입력에 따른 검토 제안</small>
              <h3>{verdict.label}</h3>
              <p>{verdict.reason}</p>
            </div>
            <strong>{verdict.usable} / 5<small>출처 유형·기입 조건 충족</small></strong>
          </div>
          <p>고객 이름·연락처·대화 원문은 적지 마세요. 익명 근거 ID와 집계된 관찰만 기록합니다. 모의 대화는 실제 가치·재사용 근거로 승격하지 않습니다.</p>
          <div className="dash-evidence-list">
            {EVIDENCE_ITEMS.map((item) => (
              <article className="dash-panel" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.question}</p>
                </div>
                <div className="dash-evidence-fields">
                  <label>근거 방향
                    <select value={ledger[item.id].status} onChange={(e) => update(item.id, 'status', e.target.value)}>
                      <option value="unknown">미확인</option>
                      <option value="support">지지</option>
                      <option value="mixed">혼합·상충</option>
                      <option value="against">반대</option>
                    </select>
                  </label>
                  <label>자료 유형
                    <select value={ledger[item.id].source} onChange={(e) => update(item.id, 'source', e.target.value)}>
                      <option value="unknown">미정</option>
                      <option value="mock">목업 체험</option>
                      <option value="interview">인터뷰·자기보고</option>
                      <option value="live">실제 사용 관찰</option>
                    </select>
                  </label>
                  <label>근거 ID·기간
                    <input maxLength={160} placeholder="예: 집계 E-01 · W1 · n=…" value={ledger[item.id].reference} onChange={(e) => update(item.id, 'reference', e.target.value)} />
                  </label>
                  <label className="dash-note">관찰·반례·한계
                    <textarea maxLength={500} rows={2} placeholder="분자/분모, 대상·기간, 반례와 아직 모르는 점" value={ledger[item.id].note} onChange={(e) => update(item.id, 'note', e.target.value)} />
                  </label>
                </div>
              </article>
            ))}
          </div>
          <div className="dash-actions">
            <button onClick={saveLedger}>검토 기록 저장</button>
            <button onClick={loadLedger}>저장 기록 불러오기</button>
            <button onClick={() => download('mio-evidence-review.json', { version: 1, at: new Date().toISOString(), source: 'manual_unverified', verdict, ledger })}>검토 JSON 내보내기</button>
          </div>
          <small>브라우저별 저장이며 팀 공동 편집·서버 보관은 아직 연결되지 않았습니다.</small>
        </section>
        <section className="dash-panel">
          <h2>실사용 코호트 · 서버 집계</h2>
          <p>첫 핵심 행동을 한 주의 사용자 중, 이후 각 주에 같은 행동을 다시 한 비율입니다. 목업 방문 ID로 계산하지 않습니다.</p>
          <div className="dash-filters">
            <label>기준일 asOf<input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
            <label>핵심 행동<input value={coreAction} onChange={(e) => setCoreAction(e.target.value)} placeholder="확정된 핵심 행동 코드" /></label>
            <button type="button" onClick={() => void loadServerCohorts()}>서버 코호트 불러오기</button>
          </div>
          <div className="dash-actions">
            <button onClick={() => download('mio-cohort-template.json', COHORT_TEMPLATE)}>빈 집계 양식 받기</button>
            <label className="dash-file">코호트 JSON 가져오기
              <input type="file" accept=".json,application/json" onChange={(e) => { void importCohorts(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {cohorts && <button onClick={() => { setCohorts(null); setCohortNotice(''); }}>불러온 집계 닫기</button>}
          </div>
          {cohortNotice && <p className="dash-warning">{cohortNotice}</p>}
          {!cohorts && !cohortNotice && <p className="dash-empty">서버 코호트를 아직 불러오지 않았습니다.</p>}
          {cohorts && (
            <>
              <p>
                기준: {cohorts.asOf} 00:00 KST 이전 / 핵심 행동: {cohorts.coreAction}<br />
                출처: {cohorts.sourceRef}
              </p>
              <div className="dash-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>첫 행동 주 · 월요일</th>
                      <th>전체 n</th>
                      {cohortTotals(cohorts).map((x) => <th key={x.period}>W{x.period}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.cohorts.map((row) => (
                      <tr key={row.weekStart}>
                        <td>{row.weekStart}</td>
                        <td>{row.size}</td>
                        {cohortTotals(cohorts).map((x) => (
                          <td key={x.period} className={typeof row.retained[x.period] === 'number' ? undefined : 'dash-pending-cell'}>
                            {typeof row.retained[x.period] === 'number'
                              ? `${pct(row.retained[x.period] as number, row.size)} (${row.retained[x.period]}/${row.size})`
                              : '아직 안 된 주'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <th>관측 가능한 코호트 합계</th>
                      <td>기간별 분모</td>
                      {cohortTotals(cohorts).map((x) => (
                        <td key={x.period}>{x.denominator ? `${pct(x.retained, x.denominator)} (${x.retained}/${x.denominator})` : '—'}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
          <small>W0는 첫 행동 주, W1은 다음 달력 주입니다. D7과 다릅니다. 미성숙·미관찰은 null, 관찰 결과 0은 0으로 구분합니다. 합계는 분모 가중 집계이며 기간별 코호트 구성이 다를 수 있습니다.</small>
        </section>
        <section id="capacity">
          <div className="dash-section-heading">
            <span>03</span>
            <div>
              <h2>Carrying Capacity · 가정 계산</h2>
              <p>첨부 자료의 유입·이탈 모델을 살펴보는 계산기입니다. 실제 Mio 예측값이 아닙니다.</p>
            </div>
          </div>
          <div className="dash-grid">
            <article className="dash-panel">
              <h3>같은 기간·같은 활성 정의로 입력</h3>
              <div className="dash-input-grid">
                <label>계산 주기
                  <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                    <option>주</option>
                    <option>일</option>
                    <option>월</option>
                  </select>
                </label>
                <label>기간당 유입 I · 명<input type="number" min="0" step="any" value={inflow} onChange={(e) => setInflow(e.target.value)} placeholder="신규 + 재활성" /></label>
                <label>기간당 이탈률 c · %<input type="number" min="0" max="100" step="any" value={churn} onChange={(e) => setChurn(e.target.value)} placeholder="기초 활성 대비 이탈" /></label>
                <label>현재 활성 N · 명<input type="number" min="0" step="any" value={active} onChange={(e) => setActive(e.target.value)} placeholder="같은 활성 정의" /></label>
              </div>
              <p className="dash-formula">N(t+1) = N(t) × (1 − c) + I<br />균형 규모 = I ÷ c</p>
              <small>신규·재활성은 기초 활성과 중복 없이 정의합니다. 일간 유입과 월간 이탈률을 섞지 않습니다. Paid와 Organic은 따로 계산하세요.</small>
            </article>
            <article className="dash-panel">
              <span className="dash-tag">가정 시뮬레이션 · 실측 아님</span>
              <h3>조건이 유지될 때의 균형</h3>
              <strong className="dash-capacity">{estimate?.ceiling !== null && estimate?.ceiling !== undefined ? `${number(estimate.ceiling)}명` : '산출 보류'}</strong>
              <p>{estimate ? `다음 ${unit} 순증감: ${number(estimate.net)}명` : '모든 입력값과 범위를 확인해주세요.'}</p>
              {estimate && estimate.ceiling === null && <p>이탈률 0%에서는 유일한 유한 균형값을 계산하지 않습니다. 무한 성장이나 PMF로 해석하지 마세요.</p>}
              <p>유입·이탈률 고정, 같은 집계 주기, 중복 없는 활성 사용자라는 가정입니다.</p>
            </article>
          </div>
          {estimate && (
            <details className="dash-panel">
              <summary>12개 기간 가정 추이 · 예측 성과 아님</summary>
              <div className="dash-table-wrap">
                <table>
                  <thead><tr><th>경과 기간</th><th>가정 활성 규모</th></tr></thead>
                  <tbody>{estimate.projection.map((n, i) => <tr key={i}><td>{i}{unit}</td><td>{number(n)}명</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          )}
        </section>
        <section id="guide" className="dash-panel">
          <h2>회의에서 읽는 순서</h2>
          <ol>
            <li><strong>자료부터 확인:</strong> 목업/실사용, 대상·채널, 기간, 중복·누락과 분모를 확인합니다.</li>
            <li><strong>진입 병목 확인:</strong> 클릭→대화 진입→입력의 차이를 봅니다. 입력을 자기노출로 간주하지 않습니다.</li>
            <li><strong>남는 이유와 떠나는 이유:</strong> 도움 없음·불편·기존 대안 충분함도 같은 비중으로 검토합니다.</li>
            <li><strong>성숙한 코호트:</strong> 핵심 행동·활성·이탈 기간을 먼저 합의합니다. 관찰 중인 사용자를 이탈자 0%로 만들지 않습니다.</li>
            <li><strong>결정:</strong> 추가 검증 / 병목 수정 / 가설 수정 / 판단 보류를 근거와 함께 남깁니다. CC와 리텐션 하나로 PMF를 확정하지 않습니다.</li>
          </ol>
        </section>
        <AdminSafetyQueue tokenSource={tokenSource} role={role} start={start} end={end} />
        <AdminConversationTracePanel tokenSource={tokenSource} />
        <footer className="dash-footer">Mio · 근거 기반 검토 도구 / 관리자 세션은 4시간 후 만료됩니다.</footer>
      </main>
    </div>
  );
}
