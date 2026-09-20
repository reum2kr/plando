const express = require('express');
const pool = require('../db/pool');
const { todayKstDateString } = require('../util/time');

const router = express.Router();

async function computeAggregate(planId) {
  const today = todayKstDateString();

  const todoCountRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM todos WHERE plan_id=$1 AND deleted_at IS NULL`,
    [planId]
  );
  const doneCountRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM todos WHERE plan_id=$1 AND deleted_at IS NULL AND status='done'`,
    [planId]
  );
  const overdueCountRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM todos
     WHERE plan_id=$1 AND deleted_at IS NULL AND status<>'done' AND due_date < $2::date`,
    [planId, today]
  );
  const blockedCountRes = await pool.query(
    `SELECT COUNT(DISTINCT t.id)::int AS n
     FROM todos t JOIN execution_logs l ON l.todo_id = t.id
     WHERE t.plan_id=$1 AND t.deleted_at IS NULL AND l.blocked_reason IS NOT NULL AND l.blocked_reason <> ''`,
    [planId]
  );
  const estimatedRes = await pool.query(
    `SELECT COALESCE(SUM(estimated_minutes),0)::int AS n FROM todos WHERE plan_id=$1 AND deleted_at IS NULL`,
    [planId]
  );
  const actualRes = await pool.query(
    `SELECT COALESCE(SUM(l.actual_minutes),0)::int AS n
     FROM execution_logs l JOIN todos t ON t.id = l.todo_id
     WHERE t.plan_id=$1 AND t.deleted_at IS NULL`,
    [planId]
  );

  const estimated_total_minutes = estimatedRes.rows[0].n;
  const actual_total_minutes = actualRes.rows[0].n;

  return {
    plan_id: planId,
    today_kst: today,
    todo_count: todoCountRes.rows[0].n,
    done_count: doneCountRes.rows[0].n,
    overdue_count: overdueCountRes.rows[0].n,
    blocked_count: blockedCountRes.rows[0].n,
    estimated_total_minutes,
    actual_total_minutes,
    diff_minutes: actual_total_minutes - estimated_total_minutes,
  };
}

// GET /api/review/:planId
router.get('/:planId', async (req, res) => {
  const plan = await pool.query(`SELECT id FROM plans WHERE id=$1 AND deleted_at IS NULL`, [req.params.planId]);
  if (plan.rows.length === 0) return res.status(404).json({ error: 'plan not found' });
  res.json(await computeAggregate(req.params.planId));
});

// GET /api/review/:planId/drilldown/:metric
// 집계 숫자를 눌렀을 때 그 숫자를 만든 실제 기록으로 이동하기 위한 엔드포인트.
router.get('/:planId/drilldown/:metric', async (req, res) => {
  const { planId, metric } = req.params;
  const today = todayKstDateString();

  switch (metric) {
    case 'todo_count': {
      const { rows } = await pool.query(
        `SELECT * FROM todos WHERE plan_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [planId]
      );
      return res.json(rows);
    }
    case 'done_count': {
      const { rows } = await pool.query(
        `SELECT * FROM todos WHERE plan_id=$1 AND deleted_at IS NULL AND status='done' ORDER BY completed_at`, [planId]
      );
      return res.json(rows);
    }
    case 'overdue_count': {
      const { rows } = await pool.query(
        `SELECT * FROM todos WHERE plan_id=$1 AND deleted_at IS NULL AND status<>'done' AND due_date < $2::date ORDER BY due_date`,
        [planId, today]
      );
      return res.json(rows);
    }
    case 'blocked_count': {
      const { rows } = await pool.query(
        `SELECT l.*, t.title AS todo_title FROM execution_logs l
         JOIN todos t ON t.id = l.todo_id
         WHERE t.plan_id=$1 AND t.deleted_at IS NULL AND l.blocked_reason IS NOT NULL AND l.blocked_reason <> ''
         ORDER BY l.started_at`,
        [planId]
      );
      return res.json(rows);
    }
    case 'estimated_total_minutes': {
      const { rows } = await pool.query(
        `SELECT id, title, estimated_minutes FROM todos WHERE plan_id=$1 AND deleted_at IS NULL ORDER BY created_at`,
        [planId]
      );
      return res.json(rows);
    }
    case 'actual_total_minutes':
    case 'diff_minutes': {
      const { rows } = await pool.query(
        `SELECT l.*, t.title AS todo_title FROM execution_logs l
         JOIN todos t ON t.id = l.todo_id
         WHERE t.plan_id=$1 AND t.deleted_at IS NULL ORDER BY l.started_at`,
        [planId]
      );
      return res.json(rows);
    }
    default:
      return res.status(400).json({ error: 'unknown metric' });
  }
});

// GET /api/review/:planId/notes
router.get('/:planId/notes', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM review_notes WHERE plan_id=$1 ORDER BY created_at DESC`, [req.params.planId]
  );
  res.json(rows);
});

// POST /api/review/:planId/notes - 돌아보기에서 정한 "고칠 점 한 줄"
router.post('/:planId/notes', async (req, res) => {
  const { note, carried_into_plan_id } = req.body;
  if (!note) return res.status(400).json({ error: 'note는 필수입니다.' });
  const { rows } = await pool.query(
    `INSERT INTO review_notes (plan_id, note, carried_into_plan_id) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.planId, note, carried_into_plan_id || null]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/review/:planId/notes/:noteId - 메모 내용 수정, 또는 "다음 계획으로 넘기기"
// (carried_into_plan_id를 넘기면 그 계획으로 연결된다. note만 보내면 내용만 바뀐다.)
router.put('/:planId/notes/:noteId', async (req, res) => {
  const cur = await pool.query(
    `SELECT * FROM review_notes WHERE id=$1 AND plan_id=$2`,
    [req.params.noteId, req.params.planId]
  );
  if (cur.rows.length === 0) return res.status(404).json({ error: 'note not found' });
  const b = cur.rows[0];
  const { note, carried_into_plan_id } = req.body;
  if (note !== undefined && !note) return res.status(400).json({ error: 'note는 빈 값일 수 없습니다.' });

  const { rows } = await pool.query(
    `UPDATE review_notes SET note=$1, carried_into_plan_id=$2 WHERE id=$3 AND plan_id=$4 RETURNING *`,
    [
      note ?? b.note,
      carried_into_plan_id !== undefined ? (carried_into_plan_id || null) : b.carried_into_plan_id,
      req.params.noteId,
      req.params.planId,
    ]
  );
  res.json(rows[0]);
});

// DELETE /api/review/:planId/notes/:noteId - 메모 삭제
router.delete('/:planId/notes/:noteId', async (req, res) => {
  const { rows } = await pool.query(
    `DELETE FROM review_notes WHERE id=$1 AND plan_id=$2 RETURNING id`,
    [req.params.noteId, req.params.planId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'note not found' });
  res.status(204).end();
});

module.exports = router;
