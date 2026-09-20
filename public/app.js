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
  for (const
