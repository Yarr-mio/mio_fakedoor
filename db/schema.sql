-- mio_funnel 저장소 스키마.
-- 앱이 첫 요청 시 자동 생성하므로(src/lib/db.ts) 수동 실행은 선택 사항이다.
-- 본 서비스(mio_server) DB와는 완전히 분리된 별도 데이터베이스를 사용할 것.

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

CREATE UNIQUE INDEX IF NOT EXISTS beta_signups_email_uniq ON beta_signups (lower(email));
