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
