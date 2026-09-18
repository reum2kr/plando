-- 실제 데이터 시드: "수면 습관 개선하기" 계획
-- psql로 직접 실행 가능 (npm 없이도 스키마/집계 로직 검증용)

BEGIN;

-- 1) 계획 생성
INSERT INTO plans (id, title, period_start, period_end, priority, success_criteria, estimated_minutes, created_at, updated_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '수면 습관 개선하기',
  '2026-09-18', '2026-09-23',
  'high',
  '평균 취침시각을 자정 전으로 당기고, 주 5일 이상 7시간 이상 수면',
  30,
  now() - interval '5 days', now() - interval '5 days'
);

-- 계획을 한 번 고쳐본다 (수정 전 값은 plan_revisions로 이동, id는 그대로)
INSERT INTO plan_revisions (plan_id, revision_no, title, period_start, period_end, priority, success_criteria, estimated_minutes, superseded_at)
VALUES (
  '11111111-1111-1111-1111-111111111111', 1,
  '수면 습관 개선하기',
  '2026-09-18', '2026-09-23',
  'high',
  '평균 취침시각을 자정 전으로 당기고, 주 5일 이상 7시간 이상 수면',
  30,
  now() - interval '3 days'
);
UPDATE plans SET
  success_criteria = '평균 취침시각을 23시 30분 전으로 당기고, 주 5일 이상 7시간 이상 수면 (카페인 제한 시각을 12시로 앞당김)',
  updated_at = now() - interval '3 days'
WHERE id = '11111111-1111-1111-1111-111111111111';

-- 2) 할 일 6개
INSERT INTO todos (id, plan_id, title, due_date, priority, tags, estimated_minutes, status, completed_at, created_at)
VALUES
  ('21111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '매일 취침 30분 전 알림 맞추기', '2026-09-18', 'medium', '{저녁루틴}', 5, 'done', now() - interval '5 days', now() - interval '5 days'),
  ('21111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', '자기 전 휴대폰 사용 줄이기', '2026-09-18', 'high', '{저녁루틴}', 10, 'done', now() - interval '4 days', now() - interval '5 days'),
  ('21111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', '카페인 섭취 시간 제한하기 (오후 2시 이후 금지)', '2026-09-19', 'high', '{낮루틴}', 0, 'pending', NULL, now() - interval '5 days'),
  ('21111111-1111-1111-1111-111111111114', '11111111-1111-1111-1111-111111111111', '주말에도 기상 시각 일정하게 유지하기', '2026-09-20', 'medium', '{아침루틴}', 0, 'pending', NULL, now() - interval '5 days'),
  ('21111111-1111-1111-1111-111111111115', '11111111-1111-1111-1111-111111111111', '자기 전 생각 비우기 (명상 5분)', '2026-09-16', 'low', '{저녁루틴}', 5, 'pending', NULL, now() - interval '5 days'),
  ('21111111-1111-1111-1111-111111111116', '11111111-1111-1111-1111-111111111111', '저녁 8시 이후로 물/음식 섭취 금지', '2026-09-18', 'medium', '{저녁루틴}', 0, 'done', now() - interval '2 days', now() - interval '5 days');

-- 완료 가드 테이블에도 반영 (done인 3개)
INSERT INTO todo_completion_state (todo_id, completed_at) VALUES
  ('21111111-1111-1111-1111-111111111111', now() - interval '5 days'),
  ('21111111-1111-1111-1111-111111111112', now() - interval '4 days'),
  ('21111111-1111-1111-1111-111111111116', now() - interval '2 days');

-- 3) 실행 기록 (5일치 취침 로그, 3개 이상 요구 충족)
INSERT INTO execution_logs (todo_id, started_at, ended_at, actual_minutes, blocked_reason, created_at)
VALUES
  ('21111111-1111-1111-1111-111111111111', '2026-09-17 23:50:00+09', '2026-09-18 07:10:00+09', 440, NULL, now() - interval '5 days'),
  ('21111111-1111-1111-1111-111111111112', '2026-09-18 23:40:00+09', '2026-09-19 06:50:00+09', 430, '밤에 카페인 섭취해서 늦게 잠듦', now() - interval '4 days'),
  ('21111111-1111-1111-1111-111111111113', '2026-09-19 23:20:00+09', '2026-09-20 07:00:00+09', 460, NULL, now() - interval '3 days'),
  ('21111111-1111-1111-1111-111111111116', '2026-09-20 23:55:00+09', '2026-09-21 06:40:00+09', 405, '휴대폰 보다가 30분 늦게 잠', now() - interval '2 days');

-- 4) 돌아보기에서 고칠 점 한 줄
INSERT INTO review_notes (plan_id, note, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', '카페인 제한 시각을 오후 2시에서 12시로 당기기', now() - interval '1 day');

COMMIT;
