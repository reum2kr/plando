const express = require('express');
const path = require('path');
require('dotenv').config();

const plansRouter = require('./routes/plans');
const todosRouter = require('./routes/todos');
const logsRouter = require('./routes/logs');
const reviewRouter = require('./routes/review');
const exportRouter = require('./routes/export');
const routinesRouter = require('./routes/routines');

const app = express();
app.use(express.json());

app.use('/api/plans', plansRouter);
app.use('/api/todos', todosRouter);
app.use('/api/logs', logsRouter);
app.use('/api/review', reviewRouter);
app.use('/api/export', exportRouter);
app.use('/api/routines', routinesRouter);

// 정적 프론트엔드 (public/) 서빙. HTML로 넘어온 텍스트는 innerText로만
// 렌더링해서(app.js 참고) 스크립트 모양 글자가 그대로 문자열로 보이게 한다.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`plando server listening on :${PORT}`);
});
