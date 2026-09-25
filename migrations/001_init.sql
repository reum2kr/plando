-- Plan-Do-See diary schema (v2)
-- All timestamps are stored as TIMESTAMPTZ (UTC under the hood).
-- "Today" for overdue calculations is always evaluated in Asia/Seoul.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NULL,                 -- filled in when auth (T07) is added
  title              TEXT NOT NULL,
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  priority           TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
  success_criteria   TEXT NOT NULL,
  estimated_minutes  INTEGER NOT NULL CHECK (estimated_minutes >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ NULL
);

-- Every time a plan is edited, the PRE-edit row is copied here first.
-- The plan's id never changes, so history always ties back to one plan.
CREATE TABLE IF NOT EXISTS plan_revisions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  revision_no        INTEGER NOT NULL,          -- 1, 2, 3... increasing per plan
  title              TEXT NOT NULL,
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  priority           TEXT NOT NULL,
  success_criteria   TEXT NOT NULL,
  estimated_minutes  INTEGER NOT NULL,
  superseded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, revision_no)
);

CREATE TABLE IF NOT EXISTS todos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  due_date           DATE NULL,
  priority           TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
  tags               TEXT[] NOT NULL DEFAULT '{}',
  estimated_minutes  INTEGER NOT NULL CHECK (estimated_minutes >= 0),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  completed_at       TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ NULL          -- soft delete: excluded from all counts
);

CREATE INDEX IF NOT EXISTS idx_todos_plan_id ON todos(plan_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

-- Guards "complete" against double-submits. One row = currently completed.
-- Insert with ON CONFLICT DO NOTHING on complete; delete on undo.
CREATE TABLE IF NOT EXISTS todo_completion_state (
  todo_id            UUID PRIMARY KEY REFERENCES todos(id) ON DELETE CASCADE,
  completed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 실행 기록: separate from the plan/todo itself, never overwrites them.
CREATE TABLE IF NOT EXISTS execution_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id            UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  started_at         TIMESTAMPTZ NOT NULL,
  ended_at           TIMESTAMPTZ NOT NULL,
  actual_minutes     INTEGER NOT NULL CHECK (actual_minutes >= 0),
  blocked_reason     TEXT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_todo_id ON execution_logs(todo_id);

-- "고칠 점 한 줄" carried from See back into the next Plan.
CREATE TABLE IF NOT EXISTS review_notes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  note               TEXT NOT NULL,
  carried_into_plan_id UUID NULL REFERENCES plans(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 루틴: "기간만 조정하면 그 기간의 날마다 같은 할 일이 자동으로 생기게" 하기 위한 템플릿.
-- 실제로 화면에 보이는 할 일들은 여전히 todos 테이블의 평범한 행이다(날짜마다 1개씩 생성됨).
-- 루틴 자체를 지우거나 기간을 줄여도, 이미 완료했거나 실행 기록이 남은 할 일은
-- 절대 건드리지 않는다(과거 기록은 그대로 둔다).
CREATE TABLE IF NOT EXISTS routines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  priority           TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
  tags               TEXT[] NOT NULL DEFAULT '{}',
  estimated_minutes  INTEGER NOT NULL CHECK (estimated_minutes >= 0),
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL CHECK (end_date >= start_date),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ NULL
);

-- 이미 배포된 DB에도 안전하게 적용되도록 ALTER는 IF NOT EXISTS로 작성한다.
ALTER TABLE todos ADD COLUMN IF NOT EXISTS routine_id UUID NULL REFERENCES routines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_todos_routine_id ON todos(routine_id);
CREATE INDEX IF NOT EXISTS idx_routines_plan_id ON routines(plan_id);

-- 인증(T07): 이메일+비밀번호 계정과 로그인 세션.
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token              TEXT PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
