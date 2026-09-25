const express = require('express');
const pool = require('../db/pool');
const {
  hashPassword, verifyPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, SESSION_COOKIE, requireAuth,
} = require('../util/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: '올바른 이메일을 입력하세요.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }
  const normalizedEmail = email.toLowerCase();

  const existing = await pool.query(`SELECT id FROM users WHERE email=$1`, [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
  }

  const password_hash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id, email`,
      [normalizedEmail, password_hash]
    );
    const user = rows[0];

    // 로그인 기능이 생기기 전에 만들어둔 계획(주인이 없는 자료)이 있다면,
    // 맨 처음 가입하는 사람 앞으로 이어붙여서 그동안 쌓아온 사용 기록이 사라지지 않게 한다.
    const userCount = await client.query(`SELECT COUNT(*)::int AS n FROM users`);
    if (userCount.rows[0].n === 1) {
      await client.query(`UPDATE plans SET user_id=$1 WHERE user_id IS NULL`, [user.id]);
    }

    await client.query('COMMIT');

    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(res, token, expiresAt);
    res.status(201).json({ id: user.id, email: user.email });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });
  }
  const { rows } = await pool.query(`SELECT * FROM users WHERE email=$1`, [email.toLowerCase()]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }
  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(res, token, expiresAt);
  res.json({ id: user.id, email: user.email });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;
  await destroySession(token);
  clearSessionCookie(res);
  res.status(204).end();
});

// GET /api/auth/me - 현재 로그인 여부 확인용
router.get('/me', requireAuth, async (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// DELETE /api/auth/me - 계정과 내 자료를 모두 지운다 (되돌릴 수 없어서 비밀번호를 다시 확인한다)
router.delete('/me', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: '계정을 지우려면 비밀번호를 다시 입력하세요.' });
  }
  const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.user.id]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // plans를 지우면 todos/routines/plan_revisions/review_notes/execution_logs/
    // todo_completion_state까지 전부 ON DELETE CASCADE로 함께 지워진다.
    await client.query(`DELETE FROM plans WHERE user_id=$1`, [req.user.id]);
    await client.query(`DELETE FROM users WHERE id=$1`, [req.user.id]); // sessions도 CASCADE로 함께 삭제됨
    await client.query('COMMIT');
    clearSessionCookie(res);
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
