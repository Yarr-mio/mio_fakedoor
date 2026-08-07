/**
 * 퍼널 자체 저장소. DATABASE_URL이 있으면 PostgreSQL(Neon/Supabase/RDS/로컬 모두 호환),
 * 없으면 콘솔 로깅으로 폴백해 로컬 개발이 설정 없이 굴러가게 한다.
 *
 * 본 서비스(mio_server) 인프라와는 완전히 분리된 별도 DB를 사용한다.
 */
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!;
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    pool = new Pool({
      connectionString: url,
      max: 3,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

/** 서버리스 인스턴스당 1회만 실행 (db/schema.sql과 동일 내용) */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS funnel_events (
          id BIGSERIAL PRIMARY KEY,
          anon_id TEXT NOT NULL,
          variant TEXT,
          name TEXT NOT NULL,
          props JSONB NOT NULL DEFAULT '{}',
          utm JSONB NOT NULL DEFAULT '{}',
          ua TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS funnel_events_name_idx ON funnel_events (name, created_at);
        CREATE INDEX IF NOT EXISTS funnel_events_anon_idx ON funnel_events (anon_id);

        CREATE TABLE IF NOT EXISTS beta_signups (
          id BIGSERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          anon_id TEXT,
          variant TEXT,
          result_type TEXT,
          source TEXT,
          utm JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS beta_signups_email_uniq
          ON beta_signups (lower(email));
      `);
    })().catch((err) => {
      schemaReady = null; // 다음 요청에서 재시도
      throw err;
    });
  }
  return schemaReady;
}

export interface FunnelEventRow {
  anonId: string;
  variant: string | null;
  name: string;
  props: Record<string, unknown>;
  utm: Record<string, string>;
  ua: string | null;
}

export async function insertEvents(rows: FunnelEventRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (!hasDb()) {
    for (const row of rows) {
      console.log("[funnel-event]", JSON.stringify(row));
    }
    return;
  }
  await ensureSchema();

  const values: unknown[] = [];
  const placeholders = rows
    .map((row, i) => {
      const base = i * 6;
      values.push(
        row.anonId,
        row.variant,
        row.name,
        JSON.stringify(row.props),
        JSON.stringify(row.utm),
        row.ua,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}::jsonb, $${base + 6})`;
    })
    .join(", ");

  await getPool().query(
    `INSERT INTO funnel_events (anon_id, variant, name, props, utm, ua) VALUES ${placeholders}`,
    values,
  );
}

export interface SignupRow {
  email: string;
  anonId: string | null;
  variant: string | null;
  resultType: string | null;
  source: string | null;
  utm: Record<string, string>;
}

/** @returns duplicated — 이미 등록된 이메일이면 true */
export async function insertSignup(row: SignupRow): Promise<{ duplicated: boolean }> {
  if (!hasDb()) {
    console.log("[funnel-signup]", JSON.stringify(row));
    return { duplicated: false };
  }
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO beta_signups (email, anon_id, variant, result_type, source, utm)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (lower(email)) DO NOTHING`,
    [
      row.email,
      row.anonId,
      row.variant,
      row.resultType,
      row.source,
      JSON.stringify(row.utm),
    ],
  );
  return { duplicated: result.rowCount === 0 };
}

export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}
