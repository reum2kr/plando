const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const VALID_PRIORITY = new Set(['high', 'medium', 'low']);
const VALID_SORT = new Set(['due_date', 'priority', 'created_at', 'title']);
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// GET /api/todos?plan_id=&q=&status=&priority=&tag=&sort=&order=
// 정렬 기준: 화면(프론트)에서 이 기준 이름을 그대로 보여준다.
router.get('/', async (req, res) => {
  const { plan_id, q, status, priority, tag } = req.query;
  let sort = VALID_SORT.has(req.query.sort) ? req.query.sort : 'due_date';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';

  const clauses = ['deleted_at IS NULL'];
  const params = [];

  if (plan_id) { params.push(plan_id); clauses.push(`plan_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  if (priority) { params.push(priority); clauses.push(`priority = $${params.length}`); }
  if (tag) { params.push(tag); clauses.push(`$${params.length} = ANY(tags)`); }
  if (q) { params.push(`%${q}%`); clauses.push(`title ILIKE $${params.length}`); }

  // 정렬 값이 같을 때의 동률 처리: 항상 created_at ASC, id ASC를 2차/3차 기준으로 덧붙여
  // "볼 때마다 순서가 달라지는" 문제를 막는다.
  let orderSql;
  if (sort === 'priority') {
    orderSql = `CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ${order}, created_at ASC, id ASC`;
  } else {
    orderSql = `${sort} ${order} NULLS LAST, created_at ASC, id ASC`;
  }

  const sql = `SELECT * FROM todos WHERE ${clauses.join(' AND ')} ORDER BY ${orderSql}`;
  const { rows } = await pool.query(sql, params);
  res.json({ items: rows, sort, order: order.toLowerCase(), tie_break: 'created_at ASC, id ASC' });
});

router.post('/', async (req, res) => {
  const { plan_id, title, due_date, priority, tags, estimated_minutes } = req.body;
  if (!plan_id || !title || !priority || !VALID_PRIORITY.has(priority) || estimated_minutes == null) {
    return res.status(400).json({ error: 'plan_id, title, priority(high/medium/low), estimated_minutes는 필수입니다.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO todos (plan_id, title, due_date, priority, tags, estimated_minutes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [plan_id, title, due_date || null, priority, tags || [], estimated_minutes]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, due_date, priority, tags, estimated_minutes, completed_at } = req.body;
  if (priority && !VALID_PRIORITY.has(priority)) {
    return res.status(400).json({ error: 'priority는 high/medium/low 중 하나여야 합니다.' });
  }
  const cur = await pool.query(`SELECT * FROM todos WHERE id=$1 AND deleted_at IS NULL`, [id]);
  if (cur.rows.length === 0) return res.status(404).json({ error: 'todo not found' });
  const b = cur.rows[0];

  // completed_at 수정은 "이미 완료한 할 일을 자정 넘겨서야 기록한" 경우처럼
  // 실제로 끝낸 시각에 맞게 바로잡는 용도다. 아직 완료 전인 할 일에는 의미가 없으니 막는다.
  if (completed_at !== undefined && b.status !== 'done') {
    return res.status(400).json({ error: '완료된 할 일만 완료 시각을 수정할 수 있습니다.' });
  }

  const { rows } = await pool.query(
    `UPDATE todos SET title=$1, due_date=$2, priority=$3, tags=$4, estimated_minutes=$5, completed_at=$6, updated_at=now()
     WHERE id=$7 RETURNING *`,
    [title ?? b.title, due_date !== undefined ? due_date : b.due_date, priority ?? b.priority,
     tags ?? b.tags, estimated_minutes ?? b.estimated_minutes,
     completed_at !== undefined ? completed_at : b.completed_at, id]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE todos SET deleted_at = now() WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'todo not found' });
  res.status(204).end();
});

// POST /api/todos/:id/complete - 완료 처리. 연달아 눌러도 1건만 기록되도록
// todo_completion_state에 (todo_id) UNIQUE PK + ON CONFLICT DO NOTHING으로 가드.
router.post('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM todos WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'todo not found' });
    }
    const inserted = await client.query(
      `INSERT INTO todo_completion_state (todo_id) VALUES ($1)
       ON CONFLICT (todo_id) DO NOTHING RETURNING todo_id`,
      [id]
    );
    const wasAlreadyDone = inserted.rows.length === 0;
    if (!wasAlreadyDone) {
      await client.query(
        `UPDATE todos SET status='done', completed_at=now(), updated_at=now() WHERE id=$1`,
        [id]
      );
    }
    await client.query('COMMIT');
    const fresh = await pool.query(`SELECT * FROM todos WHERE id=$1`, [id]);
    res.json({ ...fresh.rows[0], newly_completed: !wasAlreadyDone });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

// POST /api/todos/:id/undo - 완료를 진행 중으로 되돌림
router.post('/:id/undo', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM todo_completion_state WHERE todo_id=$1`, [id]);
    const { rows } = await client.query(
      `UPDATE todos SET status='pending', completed_at=NULL, updated_at=now()
       WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'todo not found' });
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

module.exports = router;
