import { hasDb, query } from "@/lib/db";
import { BURNOUT_TYPES, isBurnoutTypeId } from "@/lib/burnout-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "퍼널 통계",
  robots: { index: false, follow: false },
};

interface CountRow extends Record<string, unknown> {
  key: string;
  count: string;
}

interface SignupListRow extends Record<string, unknown> {
  email: string;
  variant: string | null;
  result_type: string | null;
  source: string | null;
  created_at: string;
}

async function loadStats() {
  const [totals, types, variantFunnel, signups, recentSignups] = await Promise.all([
    query<CountRow>(`
      SELECT name AS key, count(DISTINCT anon_id)::text AS count
      FROM funnel_events
      WHERE name IN ('page_viewed', 'test_started', 'test_completed', 'result_viewed')
      GROUP BY name
    `),
    query<CountRow>(`
      SELECT props->>'type' AS key, count(*)::text AS count
      FROM funnel_events
      WHERE name = 'test_completed' AND props->>'type' IS NOT NULL
      GROUP BY 1 ORDER BY count(*) DESC
    `),
    query<CountRow>(`
      SELECT variant || '/' || name AS key, count(DISTINCT anon_id)::text AS count
      FROM funnel_events
      WHERE name IN ('cta_clicked', 'beta_submitted', 'beta_link_redirected', 'fakedoor_shown')
        AND variant IS NOT NULL
      GROUP BY 1
    `),
    query<CountRow>(`SELECT 'total' AS key, count(*)::text AS count FROM beta_signups`),
    query<SignupListRow>(`
      SELECT email, variant, result_type, source, created_at::text
      FROM beta_signups ORDER BY created_at DESC LIMIT 30
    `),
  ]);

  const totalMap = Object.fromEntries(totals.map((r) => [r.key, Number(r.count)]));
  const variantMap = Object.fromEntries(variantFunnel.map((r) => [r.key, Number(r.count)]));
  return {
    totalMap,
    types,
    variantMap,
    signupCount: Number(signups[0]?.count ?? 0),
    recentSignups,
  };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <dt className="text-[0.7rem] text-ink-500">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function rate(part: number, whole: number): string {
  if (!whole) return "–";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const expected = process.env.ADMIN_TOKEN;

  if (!expected || token !== expected) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 pt-20 text-center text-sm text-ink-400">
        {expected
          ? "접근 토큰이 필요해요. ?token=… 으로 접근하세요."
          : "ADMIN_TOKEN 환경변수가 설정되지 않아 통계 페이지가 비활성화되어 있어요."}
      </main>
    );
  }

  if (!hasDb()) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 pt-20 text-center text-sm text-ink-400">
        DATABASE_URL이 없어 수집 데이터가 콘솔로만 출력되고 있어요.
      </main>
    );
  }

  const { totalMap, types, variantMap, signupCount, recentSignups } = await loadStats();
  const visitors = totalMap["page_viewed"] ?? 0;
  const started = totalMap["test_started"] ?? 0;
  const completed = totalMap["test_completed"] ?? 0;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-16 pt-10">
      <h1 className="text-xl font-bold">퍼널 통계</h1>

      <h2 className="mt-8 text-sm font-semibold text-ink-400">핵심 퍼널 (고유 방문자 기준)</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="방문" value={visitors} />
        <Stat label="테스트 시작" value={`${started} (${rate(started, visitors)})`} />
        <Stat label="완료" value={`${completed} (${rate(completed, started)})`} />
        <Stat label="베타 신청" value={`${signupCount} (${rate(signupCount, completed)})`} />
      </dl>

      <h2 className="mt-8 text-sm font-semibold text-ink-400">A/B — CTA 클릭 → 전환</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Stat
          label="A(폼) 클릭 → 제출"
          value={`${variantMap["form/cta_clicked"] ?? 0} → ${variantMap["form/beta_submitted"] ?? 0}`}
        />
        <Stat
          label="B(링크) 클릭 → 이동/폴백제출"
          value={`${variantMap["link/cta_clicked"] ?? 0} → ${
            (variantMap["link/beta_link_redirected"] ?? 0) +
            (variantMap["link/beta_submitted"] ?? 0)
          }`}
        />
      </dl>
      {(variantMap["link/fakedoor_shown"] ?? 0) > 0 && (
        <p className="mt-2 text-xs text-ink-500">
          fake door 노출: {variantMap["link/fakedoor_shown"]}명 (직행 링크 미설정 상태에서 클릭)
        </p>
      )}

      <h2 className="mt-8 text-sm font-semibold text-ink-400">유형 분포 (완료 기준)</h2>
      <ul className="mt-3 flex flex-col gap-1.5">
        {types.map((row) => {
          const name = isBurnoutTypeId(row.key) ? BURNOUT_TYPES[row.key].name : row.key;
          return (
            <li
              key={row.key}
              className="flex justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm"
            >
              <span>{name}</span>
              <span className="tabular-nums text-ink-400">{row.count}</span>
            </li>
          );
        })}
        {types.length === 0 && <li className="text-sm text-ink-500">아직 데이터가 없어요.</li>}
      </ul>

      <h2 className="mt-8 text-sm font-semibold text-ink-400">최근 베타 신청 (30건)</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="bg-white/[0.04] text-ink-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">이메일</th>
              <th className="px-4 py-2.5 font-medium">variant</th>
              <th className="px-4 py-2.5 font-medium">유형</th>
              <th className="px-4 py-2.5 font-medium">경로</th>
              <th className="px-4 py-2.5 font-medium">시각</th>
            </tr>
          </thead>
          <tbody>
            {recentSignups.map((row) => (
              <tr key={row.email} className="border-t border-white/5">
                <td className="px-4 py-2.5">{row.email}</td>
                <td className="px-4 py-2.5">{row.variant ?? "–"}</td>
                <td className="px-4 py-2.5">
                  {row.result_type && isBurnoutTypeId(row.result_type)
                    ? BURNOUT_TYPES[row.result_type].name
                    : "–"}
                </td>
                <td className="px-4 py-2.5">{row.source ?? "–"}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-500">
                  {row.created_at.slice(0, 16)}
                </td>
              </tr>
            ))}
            {recentSignups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-500">
                  아직 신청이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
