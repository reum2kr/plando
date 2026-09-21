const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const VALID_PRIORITY = new Set(['high', 'medium', 'low']);
const MAX_ROUTINE_DAYS = 366; // 실수로 아주 긴 기간을 넣어 할 일을 대량 생성하는 것을 막는 안전장치

// start_date~end_date(둘 다 "YYYY-MM-DD") 사이의 모든 날짜를 배열로 반환한다.
// UTC 기준 정수 연산만 사용해 서버 로컬 타임존과 무관하게 안전하게 계산한다.
function dateRange(startStr, endStr) {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const dates = [];
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  while (cur <= end) {
    const dt = new Date(cur);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur += 86400000;
  }
  return dates;
}

// GET /api/routines?plan_id=
router.get('/', async (req, res) => {
  const { plan_id } = req.query;
  const clauses = ['deleted_at IS NULL'];
  const params = [];
  if (plan_id) { params.push(plan_id); clauses.push(`plan_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT * FROM routines WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

// POST /api/routines - 루틴을 만들고, start_date~end_date의 날마다 할 일을 하나씩 생성한다.
router.post('/', async (req, res) => {
  const { plan_id, title, priority, estimated_minutes, tags, start_date, end_date } = req.body;
  if (!plan_id || !title || !priority || !VALID_PRIORITY.has(priority) || estimated_minutes == null || !start_date || !end_date) {
    return res.status(400).json({ error: 'plan_id, title, priority(high/medium/low), estimated_minutes, start_date, end_date는 필수입니다.' });
  }
  if (end_date < start_date) {
    return res.status(400).json({ error: 'end_date는 start_date보다 빠를 수 없습니다.' });
  }
  const dates = dateRange(start_date, end_date);
  if (dates.length > MAX_ROUTINE_DAYS) {
    return res.status(400).json({ error: `기간은 최대 ${MAX_ROUTINE_DAYS}일까지 설정할 수 있습니다.` });
  }
  const planCheck = await pool.query(`SELECT id FROM plans WHERE id=$1 AND deleted_at IS NULL`, [plan_id]);
  if (planCheck.rows.length === 0) return res.status(404).json({ error: 'plan not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const routineRes = await client.query(
      `INSERT INTO routines (plan_id, title, priority, tags, estimated_minutes, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [plan_id, title, priority, tags || [], estimated_minutes, start_date, end_date]
    );
    const routine = routineRes.rows[0];
    for (const d of dates) {
      await client.query(
        `INSERT INTO todos (plan_id, title, due_date, priority, tags, estimated_minutes, routine_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [plan_id, title, d, priority, tags || [], estimated_minutes, routine.id]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ...routine, generated_count: dates.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

// PUT /api/routines/:id - 기간(및 제목/우선순위 등)을 조정한다.
// - 새로 포함된 날짜: 할 일을 새로 만든다.
// - 빠진 날짜: 아직 완료 전이고 실행 기록도 없는 할 일만 지운다(soft delete).
//   이미 완료했거나 실행 기록이 남은 할 일은 실제로 있었던 기록이므로 절대 건드리지 않는다.
// - 진행 중(pending)인 기존 할 일은 제목/우선순위/태그/예상시간 변경을 따라가지만,
//   이미 완료된 할 일은 그대로 둔다.
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, priority, estimated_minutes, tags, start_date, end_date } = req.body;
  if (priority && !VALID_PRIORITY.has(priority)) {
    return res.status(400).json({ error: 'priority는 high/medium/low 중 하나여야 합니다.' });
  }
  const cur = await pool.query(`SELECT * FROM routines WHERE id=$1 AND deleted_at IS NULL`, [id]);
  if (cur.rows.length === 0) return res.status(404).json({ error: 'routine not found' });
  const b = cur.rows[0];

  const newStart = start_date || b.start_date;
  const newEnd = end_date || b.end_date;
  if (newEnd < newStart) {
    return res.status(400).json({ error: 'end_date는 start_date보다 빠를 수 없습니다.' });
  }
  const newDates = dateRange(newStart, newEnd);
  if (newDates.length > MAX_ROUTINE_DAYS) {
    return res.status(400).json({ error: `기간은 최대 ${MAX_ROUTINE_DAYS}일까지 설정할 수 있습니다.` });
  }
  const newTitle = title ?? b.title;
  const newPriority = priority ?? b.priority;
  const newTags = tags ?? b.tags;
  const newEstimate = estimated_minutes ?? b.estimated_minutes;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, due_date, status FROM todos WHERE routine_id=$1 AND deleted_at IS NULL`,
      [id]
    );
    const existingByDate = new Map(existing.rows.map((r) => [r.due_date, r]));
    const newDateSet = new Set(newDates);

    for (const d of newDates) {
      if (!existingByDate.has(d)) {
        await client.query(
          `INSERT INTO todos (plan_id, title, due_date, priority, tags, estimated_minutes, routine_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [b.plan_id, newTitle, d, newPriority, newTags, newEstimate, id]
        );
      }
    }

    for (const row of existing.rows) {
      if (newDateSet.has(row.due_date)) continue;
      if (row.status === 'done') continue; // 완료 기록 보존
      const logCheck = await client.query(`SELECT 1 FROM execution_logs WHERE todo_id=$1 LIMIT 1`, [row.id]);
      if (logCheck.rows.length > 0) continue; // 실행 기록 보존
      await client.query(`UPDATE todos SET deleted_at=now() WHERE id=$1`, [row.id]);
    }

    await client.query(
      `UPDATE todos SET title=$1, priority=$2, tags=$3, estimated_minutes=$4, updated_at=now()
       WHERE routine_id=$5 AND deleted_at IS NULL AND status='pending'`,
      [newTitle, newPriority, newTags, newEstimate, id]
    );

    const updated = await client.query(
      `UPDATE routines SET title=$1, priority=$2, tags=$3, estimated_minutes=$4, start_date=$5, end_date=$6, updated_at=now()
       WHERE id=$7 RETURNING *`,
      [newTitle, newPriority, newTags, newEstimate, newStart, newEnd, id]
    );

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

// DELETE /api/routines/:id - 루틴을 지운다. 아직 완료 전이고 실행 기록도 없는 할 일만 함께 지우고,
// 이미 완료했거나 실행 기록이 남은 할 일은 실제 기록이므로 그대로 남겨둔다.
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT id FROM routines WHERE id=$1 AND deleted_at IS NULL`, [id]);
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'routine not found' });
    }
    const existing = await client.query(
      `SELECT id, status FROM todos WHERE routine_id=$1 AND deleted_at IS NULL`,
      [id]
    );
    for (const row of existing.rows) {
      if (row.status === 'done') continue;
      const logCheck = await client.query(`SELECT 1 FROM execution_logs WHERE todo_id=$1 LIMIT 1`, [row.id]);
      if (logCheck.rows.length > 0) continue;
      await client.query(`UPDATE todos SET deleted_at=now() WHERE id=$1`, [row.id]);
    }
    await client.query(`UPDATE routines SET deleted_at=now() WHERE id=$1`, [id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

module.exports = router;
