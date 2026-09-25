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
  getUserByToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
};
