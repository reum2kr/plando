// 플랜두씨 다이어리 - 프론트엔드
// 중요: 사용자가 입력한 문자열은 절대 innerHTML로 넣지 않고 textContent로만 넣는다.
// (스크립트 모양 글자를 저장해도 실행되지 않고 글자 그대로 보이게 하기 위함 — T06-C57)

const state = {
  plans: [],
  currentPlanId: null,
  selectedDate: null,      // 달력에서 클릭한 날짜 (YYYY-MM-DD) 또는 null(전체보기)
  calYear: null,
  calMonth: null,           // 0~11
  completionByDate: {},     // { "YYYY-MM-DD": 완료 개수 }
};

function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(opts)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.errors?.join(', ') || `요청 실패 (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// KST 기준 날짜 문자열로 변환 ("YYYY-MM-DD")
function toKstDateString(dateLike) {
  const d = new Date(dateLike);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(d);
}

// ---------- 시작 화면 ----------
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('splashScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  loadPlans();
});

// ---------- 계획 (Plan) ----------
async function loadPlans() {
  state.plans = await api('/plans');
  renderPlanList();
  renderPlanSelect();
}

function renderPlanList() {
  const container = document.getElementById('planList');
  container.textContent = '';
  for (const plan of state.plans) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('h3', { text: plan.title }));
    card.appendChild(el('p', { text: `기간: ${plan.period_start} ~ ${plan.period_end} · 우선순위: ${plan.priority} · 하루 예상 ${plan.estimated_minutes}분` }));
    card.appendChild(el('p', { class: 'success', text: `성공 기준: ${plan.success_criteria}` }));

    const editBtn = el('button', { text: '수정', onclick: () => openEditPlan(plan) });
    const historyBtn = el('button', { text: '수정 이력 보기', onclick: () => showPlanHistory(plan.id) });
    const actions = el('div', { class: 'row' }, [editBtn, historyBtn]);
    card.appendChild(actions);

    const historyBox = el('div', { class: 'history-box', id: `hist-${plan.id}` });
    card.appendChild(historyBox);

    container.appendChild(card);
  }
}

function renderPlanSelect() {
  const sel = document.getElementById('t-plan-select');
  const prev = sel.value;
  sel.textContent = '';
  for (const plan of state.plans) {
    sel.appendChild(el('option', { value: plan.id, text: plan.title }));
  }
  if (prev && state.plans.some((p) => p.id === prev)) {
    sel.value = prev;
  }
  if (!sel.value && state.plans.length > 0) {
    sel.value = state.plans[0].id;
  }
  onPlanChanged();
}

document.getElementById('planForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    title: document.getElementById('p-title').value,
    period_start: document.getElementById('p-start').value,
    period_end: document.getElementById('p-end').value,
    priority: document.getElementById('p-priority').value,
    estimated_minutes: Number(document.getElementById('p-estimate').value),
    success_criteria: document.getElementById('p-success').value,
  };
  try {
    await api('/plans', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset();
    document.getElementById('p-estimate').value = 30;
    await loadPlans();
  } catch (err) {
    alert(err.message);
  }
});

async function openEditPlan(plan) {
  const title = prompt('계획 제목', plan.title);
  if (title === null) return;
  const success_criteria = prompt('성공 기준', plan.success_criteria);
  if (success_criteria === null) return;
  try {
    await api(`/plans/${plan.id}`, { method: 'PUT', body: JSON.stringify({ title, success_criteria }) });
    await loadPlans();
  } catch (err) {
    alert(err.message);
  }
}

async function showPlanHistory(planId) {
  const box = document.getElementById(`hist-${planId}`);
  const detail = await api(`/plans/${planId}`);
  box.textContent = '';
  if (detail.revisions.length === 0) {
    box.appendChild(el('p', { class: 'muted', text: '아직 수정 이력이 없습니다.' }));
    return;
  }
  box.appendChild(el('p', { class: 'muted', text: '수정 전 값들:' }));
  for (const rev of detail.revisions) {
    box.appendChild(el('p', { class: 'rev', text: `rev${rev.revision_no} — "${rev.title}" (${rev.superseded_at})` }));
  }
}

// ---------- 계획 선택이 바뀌면: 달력 + 할 일 + 돌아보기 모두 갱신 ----------
document.getElementById('t-plan-select').addEventListener('change', onPlanChanged);

function onPlanChanged() {
  const planId = document.getElementById('t-plan-select').value;
  state.currentPlanId = planId || null;
  state.selectedDate = null;
  document.getElementById('clearDateFilter').style.display = 'none';
  if (!planId) return;

  const today = new Date();
  const kstToday = toKstDateString(today);
  const [y, m] = kstToday.split('-').map(Number);
  state.calYear = y;
  state.calMonth = m - 1;

  refreshRightColumn();
}

async function refreshRightColumn() {
  if (!state.currentPlanId) return;
  await loadCalendarData();
  renderCalendar();
  await loadTodos();
  await loadReview();
}

// ---------- 달력 ----------
document.getElementById('calPrev').addEventListener('click', () => {
  state.calMonth -= 1;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear -= 1; }
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  state.calMonth += 1;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear += 1; }
  renderCalendar();
});

// 선택한 계획의 모든 할 일을 가져와 완료된 날짜별 개수를 집계한다 (완료 시각 completed_at 기준, KST).
async function loadCalendarData() {
  const planId = state.currentPlanId;
  const { items } = await api(`/todos?plan_id=${planId}&sort=due_date`);
  const map = {};
  for (const todo of items) {
    if (todo.status === 'done' && todo.completed_at) {
      const day = toKstDateString(todo.completed_at);
      map[day] = (map[day] || 0) + 1;
    }
  }
  state.completionByDate = map;
}

function renderCalendar() {
  const { calYear: year, calMonth: month } = state;
  document.getElementById('calTitle').textContent = `${year}년 ${month + 1}월`;

  const grid = document.getElementById('calendarGrid');
  grid.textContent = '';

  const firstDay = new Date(year, month, 1).getDay(); // 0=일요일
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKst = toKstDateString(new Date());
  const pad = (n) => String(n).padStart(2, '0');

  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(el('div', { class: 'cal-cell empty' }));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    const count = state.completionByDate[dateStr] || 0;

    const classes = ['cal-cell'];
    if (dateStr === todayKst) classes.push('today');
    if (dateStr === state.selectedDate) classes.push('selected');
    if (count > 0) classes.push('has-done');

    const cell = el('button', { type: 'button', class: classes.join(' '), onclick: () => onDateClick(dateStr) });
    cell.appendChild(el('span', { class: 'cal-day-num', text: String(day) }));
    if (count > 0) {
      cell.appendChild(el('span', { class: 'cal-badge', text: String(count) }));
    }
    grid.appendChild(cell);
  }
}

function onDateClick(dateStr) {
  if (state.selectedDate === dateStr) {
    state.selectedDate = null; // 같은 날짜 다시 누르면 선택 해제
  } else {
    state.selectedDate = dateStr;
  }
  document.getElementById('clearDateFilter').style.display = state.selectedDate ? 'inline-block' : 'none';
  renderCalendar();
  loadTodos();
}

document.getElementById('clearDateFilter').addEventListener('click', () => {
  state.selectedDate = null;
  document.getElementById('clearDateFilter').style.display = 'none';
  renderCalendar();
  loadTodos();
});

// ---------- 할 일 (Todo) ----------
async function loadTodos() {
  const planId = state.currentPlanId;
  if (!planId) return;

  const params = new URLSearchParams({ plan_id: planId });
  const q = document.getElementById('t-search').value;
  const status = document.getElementById('t-filter-status').value;
  const sort = document.getElementById('t-sort').value;
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  params.set('sort', sort);

  const { items, sort: appliedSort, order, tie_break } = await api(`/todos?${params.toString()}`);
  const filtered = state.selectedDate
    ? items.filter((t) => t.due_date === state.selectedDate)
    : items;

  const noteText = state.selectedDate
    ? `${state.selectedDate}의 할 일만 보고 있어요 · 정렬 기준: ${appliedSort} (${order})`
    : `정렬 기준: ${appliedSort} (${order}) · 동률일 때: ${tie_break}`;
  document.getElementById('sortNote').textContent = noteText;

  const list = document.getElementById('todoList');
  list.textContent = '';

  if (filtered.length === 0) {
    list.appendChild(el('li', { class: 'muted', text: state.selectedDate ? '이 날짜에 마감인 할 일이 없습니다.' : '할 일이 없습니다.' }));
    return;
  }

  for (const todo of filtered) {
    const li = el('li', { class: todo.status === 'done' ? 'done' : '' });
    li.appendChild(el('strong', { text: todo.title }));
    li.appendChild(el('span', { class: 'meta', text: ` 마감:${todo.due_date || '-'} 우선순위:${todo.priority} 예상:${todo.estimated_minutes}분 태그:${(todo.tags||[]).join(',')||'-'}` }));

    const editBtn = el('button', { text: '수정', onclick: () => openEditTodo(todo) });
    const doneBtn = el('button', { text: todo.status === 'done' ? '되돌리기' : '완료' , onclick: () => toggleDone(todo) });
    const logBtn = el('button', { text: '실행 기록 추가', onclick: () => openLogDialog(todo.id) });
    const logsBox = el('div', { class: 'logs-box', id: `logs-${todo.id}` });
    const viewLogsBtn = el('button', { text: '실행 기록 보기', onclick: () => toggleLogsView(todo.id, logsBox) });
    const delBtn = el('button', { text: '삭제', onclick: () => deleteTodo(todo.id) });
    li.appendChild(el('div', { class: 'row' }, [editBtn, doneBtn, logBtn, viewLogsBtn, delBtn]));
    li.appendChild(logsBox);

    list.appendChild(li);
  }
}

document.getElementById('todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const planId = state.currentPlanId;
  if (!planId) return alert('먼저 계획을 선택하세요.');
  const tags = document.getElementById('t-tags').value.split(',').map((s) => s.trim()).filter(Boolean);
  const body = {
    plan_id: planId,
    title: document.getElementById('t-title').value,
    due_date: document.getElementById('t-due').value || null,
    priority: document.getElementById('t-priority').value,
    estimated_minutes: Number(document.getElementById('t-estimate').value),
    tags,
  };
  try {
    await api('/todos', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset();
    document.getElementById('t-estimate').value = 15;
    await loadCalendarData();
    renderCalendar();
    await loadTodos();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('t-search-btn').addEventListener('click', loadTodos);

async function openEditTodo(todo) {
  const title = prompt('할 일 제목', todo.title);
  if (title === null) return;
  const due_date = prompt('마감일 (YYYY-MM-DD, 없으면 비워두기)', todo.due_date || '');
  if (due_date === null) return;
  const priority = prompt('우선순위 (high/medium/low)', todo.priority);
  if (priority === null) return;
  const estimateStr = prompt('예상 시간(분)', String(todo.estimated_minutes));
  if (estimateStr === null) return;
  const tagsStr = prompt('태그 (쉼표로 구분)', (todo.tags || []).join(','));
  if (tagsStr === null) return;

  try {
    await api(`/todos/${todo.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        due_date: due_date || null,
        priority,
        estimated_minutes: Number(estimateStr),
        tags: tagsStr.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    await loadCalendarData();
    renderCalendar();
    await loadTodos();
  } catch (err) {
    alert(err.message);
  }
}

async function toggleDone(todo) {
  try {
    if (todo.status === 'done') {
      await api(`/todos/${todo.id}/undo`, { method: 'POST' });
    } else {
      await api(`/todos/${todo.id}/complete`, { method: 'POST' });
    }
    await loadCalendarData();
    renderCalendar();
    await loadTodos();
    await loadReview();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTodo(id) {
  if (!confirm('삭제할까요?')) return;
  try {
    await api(`/todos/${id}`, { method: 'DELETE' });
    await loadCalendarData();
    renderCalendar();
    await loadTodos();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- 실행 기록 (Log) ----------
const logDialog = document.getElementById('logDialog');
function openLogDialog(todoId) {
  document.getElementById('l-todo-id').value = todoId;
  logDialog.showModal();
}
document.getElementById('l-cancel').addEventListener('click', () => logDialog.close());
document.getElementById('logForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    todo_id: document.getElementById('l-todo-id').value,
    started_at: new Date(document.getElementById('l-start').value).toISOString(),
    ended_at: new Date(document.getElementById('l-end').value).toISOString(),
    actual_minutes: Number(document.getElementById('l-actual').value),
    blocked_reason: document.getElementById('l-blocked').value || null,
  };
  try {
    await api('/logs', { method: 'POST', body: JSON.stringify(body) });
    logDialog.close();
    document.getElementById('logForm').reset();
    await loadTodos();
    await loadReview();
  } catch (err) {
    alert(err.message);
  }
});

// 로그 목록 펼치기/접기 + 수정/삭제
async function toggleLogsView(todoId, box) {
  if (box.dataset.open === '1') {
    box.textContent = '';
    box.dataset.open = '0';
    return;
  }
  box.dataset.open = '1';
  await renderLogsBox(todoId, box);
}

async function renderLogsBox(todoId, box) {
  const logs = await api(`/logs?todo_id=${todoId}`);
  box.textContent = '';
  if (logs.length === 0) {
    box.appendChild(el('p', { class: 'muted', text: '아직 실행 기록이 없습니다.' }));
    return;
  }
  const ul = el('ul', { class: 'log-list' });
  for (const log of logs) {
    const li = el('li');
    const info = `시작:${log.started_at} 끝:${log.ended_at} 실제:${log.actual_minutes}분${log.blocked_reason ? ' 막힘:' + log.blocked_reason : ''}`;
    li.appendChild(el('span', { text: info }));
    li.appendChild(el('button', { text: '수정', onclick: () => editLog(log, todoId, box) }));
    li.appendChild(el('button', { text: '삭제', onclick: () => deleteLog(log.id, todoId, box) }));
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

function toLocalInputValue(isoString) {
  // datetime-local input이 이해하는 "YYYY-MM-DDTHH:mm" 형식으로 변환 (로컬 시간대 기준)
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function editLog(log, todoId, box) {
  const startStr = prompt('시작 시각 (YYYY-MM-DD HH:mm)', toLocalInputValue(log.started_at).replace('T', ' '));
  if (startStr === null) return;
  const endStr = prompt('끝난 시각 (YYYY-MM-DD HH:mm)', toLocalInputValue(log.ended_at).replace('T', ' '));
  if (endStr === null) return;
  const actualStr = prompt('실제로 걸린 시간(분)', String(log.actual_minutes));
  if (actualStr === null) return;
  const blocked = prompt('막혔던 이유 (없으면 비워두기)', log.blocked_reason || '');
  if (blocked === null) return;

  try {
    await api(`/logs/${log.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        started_at: new Date(startStr.replace(' ', 'T')).toISOString(),
        ended_at: new Date(endStr.replace(' ', 'T')).toISOString(),
        actual_minutes: Number(actualStr),
        blocked_reason: blocked || null,
      }),
    });
    await renderLogsBox(todoId, box);
    await loadReview();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteLog(logId, todoId, box) {
  if (!confirm('이 실행 기록을 삭제할까요?')) return;
  try {
    await api(`/logs/${logId}`, { method: 'DELETE' });
    await renderLogsBox(todoId, box);
    await loadReview();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- 돌아보기 (See) ----------
async function loadReview() {
  const planId = state.currentPlanId;
  if (!planId) return;

  const agg = await api(`/review/${planId}`);
  const grid = document.getElementById('reviewGrid');
  grid.textContent = '';

  const metrics = [
    ['todo_count', '계획 수(할 일 총계)', agg.todo_count],
    ['done_count', '완료 수', agg.done_count],
    ['overdue_count', '지연 수', agg.overdue_count],
    ['blocked_count', '막힘 수', agg.blocked_count],
    ['estimated_total_minutes', '예상 시간(분)', agg.estimated_total_minutes],
    ['actual_total_minutes', '실제 시간(분)', agg.actual_total_minutes],
    ['diff_minutes', '차이(실제-예상, 분)', agg.diff_minutes],
  ];
  for (const [key, label, value] of metrics) {
    const tile = el('button', { class: 'metric-tile', onclick: () => showDrilldown(planId, key, label) });
    tile.appendChild(el('div', { class: 'metric-value', text: String(value) }));
    tile.appendChild(el('div', { class: 'metric-label', text: label }));
    grid.appendChild(tile);
  }

  await loadNotes(planId);
}

async function showDrilldown(planId, metric, label) {
  const rows = await api(`/review/${planId}/drilldown/${metric}`);
  const area = document.getElementById('drilldownArea');
  area.textContent = '';
  area.appendChild(el('h4', { text: `근거 기록: ${label}` }));
  if (rows.length === 0) {
    area.appendChild(el('p', { class: 'muted', text: '해당하는 기록이 없습니다.' }));
    return;
  }
  const ul = el('ul');
  for (const r of rows) {
    const label2 = r.title || r.todo_title || r.id;
    const extra = r.blocked_reason ? ` (막힘: ${r.blocked_reason})` : '';
    ul.appendChild(el('li', { text: `${label2}${extra}` }));
  }
  area.appendChild(ul);
}

async function loadNotes(planId) {
  const notes = await api(`/review/${planId}/notes`);
  const list = document.getElementById('noteList');
  list.textContent = '';
  for (const n of notes) {
    const li = el('li');
    li.appendChild(el('span', { text: `${n.note} (${n.created_at}) ` }));

    if (n.carried_into_plan_id) {
      const target = state.plans.find((p) => p.id === n.carried_into_plan_id);
      const label = target ? `다음 계획 "${target.title}"로 넘김` : '다음 계획으로 넘김';
      li.appendChild(el('span', { class: 'success', text: label }));
    } else {
      const otherPlans = state.plans.filter((p) => p.id !== planId);
      if (otherPlans.length > 0) {
        const sel = el('select', { class: 'carry-select' });
        for (const p of otherPlans) {
          sel.appendChild(el('option', { value: p.id, text: p.title }));
        }
        const carryBtn = el('button', {
          text: '다음 계획으로 넘기기',
          onclick: () => carryNote(planId, n, sel.value),
        });
        li.appendChild(sel);
        li.appendChild(carryBtn);
      }
    }

    const editBtn = el('button', { text: '수정', onclick: () => editNote(planId, n) });
    const delBtn = el('button', { text: '삭제', onclick: () => deleteNote(planId, n.id) });
    li.appendChild(editBtn);
    li.appendChild(delBtn);
    list.appendChild(li);
  }
}

async function carryNote(planId, note, targetPlanId) {
  if (!targetPlanId) return alert('넘길 계획이 없습니다. 다른 계획을 먼저 만들어 주세요.');
  try {
    await api(`/review/${planId}/notes/${note.id}`, {
      method: 'PUT',
      body: JSON.stringify({ carried_into_plan_id: targetPlanId }),
    });
    await loadNotes(planId);
  } catch (err) {
    alert(err.message);
  }
}

async function editNote(planId, note) {
  const text = prompt('메모 수정', note.note);
  if (text === null) return;
  try {
    await api(`/review/${planId}/notes/${note.id}`, { method: 'PUT', body: JSON.stringify({ note: text }) });
    await loadNotes(planId);
  } catch (err) {
    alert(err.message);
  }
}

async function deleteNote(planId, noteId) {
  if (!confirm('메모를 삭제할까요?')) return;
  try {
    await api(`/review/${planId}/notes/${noteId}`, { method: 'DELETE' });
    await loadNotes(planId);
  } catch (err) {
    alert(err.message);
  }
}

document.getElementById('noteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const planId = state.currentPlanId;
  const note = document.getElementById('r-note').value;
  try {
    await api(`/review/${planId}/notes`, { method: 'POST', body: JSON.stringify({ note }) });
    e.target.reset();
    await loadNotes(planId);
  } catch (err) {
    alert(err.message);
  }
});

// ---------- 내보내기 ----------
document.getElementById('exportBtn').addEventListener('click', () => {
  window.location.href = '/api/export';
});
