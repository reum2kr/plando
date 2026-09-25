const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const SESSION_COOKIE = 'plando_session';
const SESSION_DAYS = 30;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// 세션은 DB에 저장하고(토큰=기본키), 브라우저에는 httpOnly 쿠키로 토큰만 내려준다.
async function createSession(userId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`,
    [token, userId, expiresAt]
  );
  return { token, expiresAt };
}

async function destroySession(token) {
  if (!token) return;
  await pool.query(`DELETE FROM sessions WHERE token=$1`, [token]);
}

// 비밀번호를 바꿀 때 쓴다: 그 계정으로 발급된 모든 세션을 지워서
// "이전에 발급한 값이 더는 통하지 않게" 만든다. exceptToken을 주면
// 그 토큰(지금 이 요청을 보낸 세션)만 살려서 로그인 상태를 유지한다.
async function destroyAllSessionsForUser(userId, exceptToken) {
  if (exceptToken) {
    await pool.query(`DELETE FROM sessions WHERE user_id=$1 AND token<>$2`, [userId, exceptToken]);
  } else {
    await pool.query(`DELETE FROM sessions WHERE user_id=$1`, [userId]);
  }
}

async function getUserByToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token=$1 AND s.expires_at > now()`,
    [token]
  );
  return rows[0] || null;
}

function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE);
}

// 로그인이 필요한 라우터 앞에 붙인다. req.user = { id, email }를 채워준다.
async function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;
  const user = await getUserByToken(token);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.user = user;
  next();
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  destroyAllSessionsForUser,
  getUserByToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
};
