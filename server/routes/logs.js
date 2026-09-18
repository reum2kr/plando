const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/logs?todo_id=
router.get('/', async (req, res) => {
  const { todo_id } = req.query;
  if (todo_id) {
    const { rows } = await pool.query(
      `SELECT * FROM execution_logs WHERE todo_id=$1 ORDER BY started_at ASC`,
      [todo_id]
    );
    return res.json(rows);
  }
  const { rows } = await pool.query(`SELECT * FROM execution_logs ORDER BY started_at DESC`);
  res.json(rows);
});

// POST /api/logs - 실행 기록 추가 (계획/할 일 원본 값은 절대 건드리지 않음)
router.post('/', async (req, res) => {
  const { todo_id, started_at, ended_at, actual_minutes, blocked_reason } = req.body;
  if (!todo_id || !started_at || !ended_at || actual_minutes == null) {
    return res.status(400).json({ error: 'todo_id, started_at, ended_at, actual_minutes는 필수입니다.' });
  }
  const todoCheck = await pool.query(`SELECT id FROM todos WHERE id=$1 AND deleted_at IS NULL`, [todo_id]);
  if (todoCheck.rows.length === 0) return res.status(404).json({ error: 'todo not found' });

  const { rows } = await pool.query(
    `INSERT INTO execution_logs (todo_id, started_at, ended_at, actual_minutes, blocked_reason)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [todo_id, started_at, ended_at, actual_minutes, blocked_reason || null]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
