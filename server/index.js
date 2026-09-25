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

app.use('/api/plans', requireAuth, plansRouter);
app.use('/api/todos', requireAuth, todosRouter);
app.use('/api/logs', requireAuth, logsRouter);
app.use('/api/review', requireAuth, reviewRouter);
app.use('/api/export', requireAuth, exportRouter);
app.use('/api/routines', requireAuth, routinesRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`plando server listening on :${PORT}`);
});
