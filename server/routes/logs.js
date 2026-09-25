const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

router.get('/', async (req, res) => {
  const { todo_id } = req.query;
  if (todo_id) {
    const owned = await pool.query(
      `SELECT t.id FROM todos t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1 AND p.user_id=$2`,
      [todo_id, req.user.id]
    );
    if (owned.rows.length === 0) return res.status(404).json({ error: 'todo not found' });
    const { rows } = await pool.query(
      `SELECT * FROM execution_logs WHERE todo_id=$1 ORDER BY started_at ASC`,
      [todo_id]
    );
    return res.json(rows);
  }
  const { rows } = await pool.query(
    `SELECT l.* FROM execution_logs l
     JOIN todos t ON t.id = l.todo_id
     JOIN plans p ON p.id = t.plan_id
     WHERE p.user_id=$1 ORDER BY l.started_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { todo_id, started_at, ended_at, actual_minutes, blocked_reason } = req.body;
  if (!todo_id || !started_at || !ended_at || actual_minutes == null) {
    return res.status(400).json({ error: 'todo_id, started_at, ended_at, actual_minutes는 필수입니다.' });
  }
  const todoCheck = await pool.query(
    `SELECT t.id FROM todos t JOIN plans p ON p.id=t.plan_id
     WHERE t.id=$1 AND t.deleted_at IS NULL AND p.user_id=$2`,
    [todo_id, req.user.id]
  );
  if (todoCheck.rows.length === 0) return res.status(404).json({ error: 'todo not found' });

  const { rows } = await pool.query(
    `INSERT INTO execution_logs (todo_id, started_at, ended_at, actual_minutes, blocked_reason)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [todo_id, started_at, ended_at, actual_minutes, blocked_reason || null]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
