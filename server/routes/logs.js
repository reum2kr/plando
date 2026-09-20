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

// PUT /api/logs/:id - 실행 기록 수정
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const cur = await pool.query(`SELECT * FROM execution_logs WHERE id=$1`, [id]);
  if (cur.rows.length === 0) return res.status(404).json({ error: 'log not found' });
  const b = cur.rows[0];
  const { started_at, ended_at, actual_minutes, blocked_reason } = req.body;

  const { rows } = await pool.query(
    `UPDATE execution_logs SET started_at=$1, ended_at=$2, actual_minutes=$3, blocked_reason=$4
     WHERE id=$5 RETURNING *`,
    [
      started_at ?? b.started_at,
      ended_at ?? b.ended_at,
      actual_minutes ?? b.actual_minutes,
      blocked_reason !== undefined ? (blocked_reason || null) : b.blocked_reason,
      id,
    ]
  );
  res.json(rows[0]);
});

// DELETE /api/logs/:id - 실행 기록 삭제
router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(`DELETE FROM execution_logs WHERE id=$1 RETURNING id`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'log not found' });
  res.status(204).end();
});

module.exports = router;
