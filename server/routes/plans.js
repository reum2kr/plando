const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const VALID_PRIORITY = new Set(['high', 'medium', 'low']);

function validatePlanBody(body, { partial = false } = {}) {
  const errors = [];
  const required = ['title', 'period_start', 'period_end', 'priority', 'success_criteria', 'estimated_minutes'];
  for (const field of required) {
    if (!partial && (body[field] === undefined || body[field] === null || body[field] === '')) {
      errors.push(`${field}는 필수입니다.`);
    }
  }
  if (body.priority !== undefined && !VALID_PRIORITY.has(body.priority)) {
    errors.push('priority는 high/medium/low 중 하나여야 합니다.');
  }
  if (body.estimated_minutes !== undefined && (typeof body.estimated_minutes !== 'number' || body.estimated_minutes < 0)) {
    errors.push('estimated_minutes는 0 이상의 숫자여야 합니다.');
  }
  return errors;
}

// GET /api/plans - 목록 (지우지 않은 것만)
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM plans WHERE deleted_at IS NULL ORDER BY created_at DESC`
  );
  res.json(rows);
});

// GET /api/plans/:id - 단건 + 수정 이력
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const planRes = await pool.query(`SELECT * FROM plans WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (planRes.rows.length === 0) return res.status(404).json({ error: 'plan not found' });

  const revRes = await pool.query(
    `SELECT * FROM plan_revisions WHERE plan_id = $1 ORDER BY revision_no ASC`,
    [id]
  );
  res.json({ ...planRes.rows[0], revisions: revRes.rows });
});

// POST /api/plans - 계획 생성
router.post('/', async (req, res) => {
  const errors = validatePlanBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { title, period_start, period_end, priority, success_criteria, estimated_minutes } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO plans (title, period_start, period_end, priority, success_criteria, estimated_minutes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title, period_start, period_end, priority, success_criteria, estimated_minutes]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/plans/:id - 계획 수정 (수정 전 값은 plan_revisions에 보존, id는 그대로)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const errors = validatePlanBody(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ errors });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM plans WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'plan not found' });
    }
    const before = cur.rows[0];

    const nextRevRes = await client.query(
      `SELECT COALESCE(MAX(revision_no), 0) + 1 AS next FROM plan_revisions WHERE plan_id = $1`,
      [id]
    );
    const nextRevisionNo = nextRevRes.rows[0].next;

    // 수정 전 값을 이력으로 먼저 저장
    await client.query(
      `INSERT INTO plan_revisions
         (plan_id, revision_no, title, period_start, period_end, priority, success_criteria, estimated_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, nextRevisionNo, before.title, before.period_start, before.period_end, before.priority, before.success_criteria, before.estimated_minutes]
    );

    const merged = {
      title: req.body.title ?? before.title,
      period_start: req.body.period_start ?? before.period_start,
      period_end: req.body.period_end ?? before.period_end,
      priority: req.body.priority ?? before.priority,
      success_criteria: req.body.success_criteria ?? before.success_criteria,
      estimated_minutes: req.body.estimated_minutes ?? before.estimated_minutes,
    };

    const upd = await client.query(
      `UPDATE plans SET title=$1, period_start=$2, period_end=$3, priority=$4,
         success_criteria=$5, estimated_minutes=$6, updated_at=now()
       WHERE id=$7 RETURNING *`,
      [merged.title, merged.period_start, merged.period_end, merged.priority, merged.success_criteria, merged.estimated_minutes, id]
    );

    await client.query('COMMIT');
    res.json(upd.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

// DELETE /api/plans/:id - soft delete
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE plans SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'plan not found' });
  res.status(204).end();
});

module.exports = router;
