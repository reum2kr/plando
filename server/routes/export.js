const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

router.get('/', async (req, res) => {
  const userId = req.user.id;

  const plans = await pool.query(
    `SELECT * FROM plans WHERE deleted_at IS NULL AND user_id=$1 ORDER BY created_at`,
    [userId]
  );
  const revisions = await pool.query(
    `SELECT r.* FROM plan_revisions r JOIN plans p ON p.id=r.plan_id
     WHERE p.user_id=$1 ORDER BY r.plan_id, r.revision_no`,
    [userId]
  );
  const todos = await pool.query(
    `SELECT t.* FROM todos t JOIN plans p ON p.id=t.plan_id
     WHERE t.deleted_at IS NULL AND p.user_id=$1 ORDER BY t.created_at`,
    [userId]
  );
  const logs = await pool.query(
    `SELECT l.* FROM execution_logs l
     JOIN todos t ON t.id=l.todo_id JOIN plans p ON p.id=t.plan_id
     WHERE p.user_id=$1 ORDER BY l.started_at`,
    [userId]
  );
  const notes = await pool.query(
    `SELECT n.* FROM review_notes n JOIN plans p ON p.id=n.plan_id
     WHERE p.user_id=$1 ORDER BY n.created_at`,
    [userId]
  );

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
