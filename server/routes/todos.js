const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const VALID_PRIORITY = new Set(['high', 'medium', 'low']);
const VALID_SORT = new Set(['due_date', 'priority', 'created_at', 'title']);

router.get('/', async (req, res) => {
  const { plan_id, q, status, priority, tag } = req.query;
  let sort = VALID_SORT.has(req.query.sort) ? req.query.sort : 'due_date';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';

  const clauses = ['t.deleted_at IS NULL', 'p.user_id = $1'];
  const params = [req.user.id];

  if (plan_id) { params.push(plan_id); clauses.push(`t.plan_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`t.status = $${params.length}`); }
  if (priority) { params.push(priority); clauses.push(`t.priority = $${params.length}`); }
  if (tag) { params.push(tag); clauses.push(`$${params.length} = ANY(t.tags)`); }
  if (q) { params.push(`%${q}%`); clauses.push(`t.title ILIKE $${params.length}`); }

  let orderSql;
  if (sort === 'priority') {
    orderSql = `CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ${order}, t.created_at ASC, t.id ASC`;
  } else {
    orderSql = `t.${sort} ${order} NULLS LAST, t.created_at ASC, t.id ASC`;
  }

  const sql = `SELECT t.* FROM todos t JOIN plans p ON p.id = t.plan_id WHERE ${clauses.join(' AND ')} ORDER BY ${orderSql}`;
  const { rows } = await pool.query(sql, params);
  res.json({ items: rows, sort, order: order.toLowerCase(), tie_break: 'created_at ASC, id ASC' });
});

router.post('/', async (req, res) => {
  const { plan_id, title, due_date, priority, tags, estimated_minutes } = req.body;
  if (!plan_id || !title || !priority || !VALID_PRIORITY.has(priority) || estimated_minutes == null) {
    return res.status(400).json({ error: 'plan_id, title, priority(high/medium/low), estimated_minutes는 필수입니다.' });
  }
  const planCheck = await pool.query(
    `SELECT id FROM plans WHERE id=$1 AND deleted_at IS NULL AND user_id=$2`,
    [plan_id, req.user.id]
  );
  if (planCheck.rows.length === 0) return res.status(404).json({ error: 'plan not found' });

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
  const cur = await pool.query(
    `SELECT t.* FROM todos t JOIN plans p ON p.id=t.plan_id
     WHERE t.id=$1 AND t.deleted_at IS NULL AND p.user_id=$2`,
    [id, req.user.id]
  );
  if (cur.rows.length === 0) return res.status(404).json({ error: 'todo not found' });
  const b = cur.rows[0];

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
  const owned = await pool.query(
    `SELECT t.id FROM todos t JOIN plans p ON p.id=t.plan_id
     WHERE t.id=$1 AND t.deleted_at IS NULL AND p.user_id=$2`,
    [id, req.user.id]
  );
  if (owned.rows.length === 0) return res.status(404).json({ error: 'todo not found' });

  const { rows } = await pool.query(
    `UPDATE todos SET deleted_at = now() WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'todo not found' });
  res.status(204).end();
});

router.post('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT t.* FROM todos t JOIN plans p ON p.id=t.plan_id
       WHERE t.id=$1 AND t.deleted_at IS NULL AND p.user_id=$2 FOR UPDATE OF t`,
      [id, req.user.id]
    );
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

router.post('/:id/undo', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owned = await client.query(
      `SELECT t.id FROM todos t JOIN plans p ON p.id=t.plan_id
       WHERE t.id=$1 AND t.deleted_at IS NULL AND p.user_id=$2`,
      [id, req.user.id]
    );
    if (owned.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'todo not found' });
    }
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
