const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRouter = require('./routes/auth');
const plansRouter = require('./routes/plans');
const todosRouter = require('./routes/todos');
const logsRouter = require('./routes/logs');
const reviewRouter = require('./routes/review');
const exportRouter = require('./routes/export');
const routinesRouter = require('./routes/routines');
const { requireAuth } = require('./util/auth');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);

// 아래부터는 전부 로그인이 필요하다. 각 라우터 안에서도 req.user.id로
// "내 계획/할 일/기록"만 보이도록 한 번 더 걸러낸다.
app.use('/api/plans', requireAuth, plansRouter);
app.use('/api/todos', requireAuth, todosRouter);
app.use('/api/logs', requireAuth, logsRouter);
app.use('/api/review', requireAuth, reviewRouter);
app.use('/api/export', requireAuth, exportRouter);
app.use('/api/routines', requireAuth, routinesRouter);

// 정적 프론트엔드 (public/) 서빙. HTML로 넘어온 텍스트는 innerText로만
// 렌더링해서(app.js 참고) 스크립트 모양 글자가 그대로 문자열로 보이게 한다.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`plando server listening on :${PORT}`);
});
