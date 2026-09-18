// 플랜두씨 다이어리 - 프론트엔드
// 중요: 사용자가 입력한 문자열은 절대 innerHTML로 넣지 않고 textContent로만 넣는다.
// (스크립트 모양 글자를 저장해도 실행되지 않고 글자 그대로 보이게 하기 위함 — T06-C57)

const state = {
  plans: [],
  currentTodoPlanId: null,
  currentReviewPlanId: null,
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

// ---------- 탭 전환 ----------
document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'todo') loadTodos();
    if (btn.dataset.tab === 'review') loadReview();
  });
});

// ---------- 계획 (Plan) ----------
async function loadPlans() {
  state.plans = await api('/plans');
  renderPlanList();
  renderPlanSelects();
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

function renderPlanSelects() {
  for (const selectId of ['t-plan-select', 'r-plan-select']) {
    const sel = document.getElementById(selectId);
    const prev = sel.value;
    sel.textContent = '';
    for (const plan of state.plans) {
      sel.appendChild(el('option', { value: plan.id, text: plan.title }));
    }
    if (prev && state.plans.some((p) => p.id === prev)) sel.value = prev;
  }
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

// ---------- 할 일 (Todo) ----------
document.getElementById('t-plan-select').addEventListener('change', loadTodos);

async function loadTodos() {
  const planId = document.getElementById('t-plan-select').value;
  state.currentTodoPlanId = planId;
  if (!planId) return;

  const params = new URLSearchParams({ plan_id: planId });
  const q = document.getElementById('t-search').value;
  const status = document.getElementById('t-filter-status').value;
  const sort = document.getElementById('t-sort').value;
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  params.set('sort', sort);

  const { items, sort: appliedSort, order, tie_break } = await api(`/todos?${params.toString()}`);
  document.getElementById('sortNote').textContent =
    `정렬 기준: ${appliedSort} (${order}) · 동률일 때: ${tie_break}`;

  const list = document.getElementById('todoList');
  list.textContent = '';
  for (const todo of items) {
    const li = el('li', { class: todo.status === 'done' ? 'done' : '' });
    li.appendChild(el('strong', { text: todo.title }));
    li.appendChild(el('span', { class: 'meta', text: ` 마감:${todo.due_date || '-'} 우선순위:${todo.priority} 예상:${todo.estimated_minutes}분 태그:${(todo.tags||[]).join(',')||'-'}` }));

    const doneBtn = el('button', { text: todo.status === 'done' ? '되돌리기' : '완료' , onclick: () => toggleDone(todo) });
    const logBtn = el('button', { text: '실행 기록 추가', onclick: () => openLogDialog(todo.id) });
    const delBtn = el('button', { text: '삭제', onclick: () => deleteTodo(todo.id) });
    li.appendChild(el('div', { class: 'row' }, [doneBtn, logBtn, delBtn]));

    list.appendChild(li);
  }
}

document.getElementById('todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const planId = document.getElementById('t-plan-select').value;
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
    await loadTodos();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('t-search-btn').addEventListener('click', loadTodos);

async function toggleDone(todo) {
  try {
    if (todo.status === 'done') {
      await api(`/todos/${todo.id}/undo`, { method: 'POST' });
    } else {
      await api(`/todos/${todo.id}/complete`, { method: 'POST' });
    }
    await loadTodos();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTodo(id) {
  if (!confirm('삭제할까요?')) return;
  try {
    await api(`/todos/${id}`, { method: 'DELETE' });
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
  } catch (err) {
    alert(err.message);
  }
});

// ---------- 돌아보기 (Review/See) ----------
document.getElementById('r-plan-select').addEventListener('change', loadReview);

async function loadReview() {
  const planId = document.getElementById('r-plan-select').value;
  state.currentReviewPlanId = planId;
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
    list.appendChild(el('li', { text: `${n.note} (${n.created_at})` }));
  }
}

document.getElementById('noteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const planId = document.getElementById('r-plan-select').value;
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

// ---------- 초기 로드 ----------
loadPlans();
