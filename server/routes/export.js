const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/export - 내 자료 전체를 파일 하나(JSON)로 내려받기
router.get('/', async (req, res) => {
  const plans = await pool.query(`SELECT * FROM plans WHERE deleted_at IS NULL ORDER BY created_at`);
  const revisions = await pool.query(`SELECT * FROM plan_revisions ORDER BY plan_id, revision_no`);
  const todos = await pool.query(`SELECT * FROM todos WHERE deleted_at IS NULL ORDER BY created_at`);
  const logs = await pool.query(`SELECT * FROM execution_logs ORDER BY started_at`);
  const notes = await pool.query(`SELECT * FROM review_notes ORDER BY created_at`);

  const payload = {
    exported_at: new Date().toISOString(),
    plans: plans.rows,
    plan_revisions: revisions.rows,
    todos: todos.rows,
    execution_logs: logs.rows,
    review_notes: notes.rows,
  };

  res.setHeader('Content-Disposition', `attachment; filename="plando-export-${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload, null, 2));
});

module.exports = router;
