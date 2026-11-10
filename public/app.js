// JesutofunmiOS — front-end logic. Framework-free; talks to /api/* (Pages Functions + D1).

'use strict';

/* ================= helpers ================= */

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseDay(iso) {
  return new Date(`${iso}T00:00:00`);
}

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysUntil(iso) {
  return Math.round((parseDay(iso) - parseDay(todayStr())) / 86400000);
}

function fmtDate(iso) {
  if (!iso) return '';
  return parseDay(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* ================= markdown (safe subset) ================= */

function inlineMd(text) {
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (m, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    if (/^https?:\/\//i.test(url)) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return m;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  text = text.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`);
  return text;
}

function renderMarkdown(src) {
  const lines = esc(src || '').split('\n');
  let html = '';
  let listType = null;
  let para = [];
  const flushPara = () => {
    if (para.length) { html += `<p>${inlineMd(para.join(' '))}</p>`; para = []; }
  };
  const flushList = () => {
    if (listType) { html += `</${listType}>`; listType = null; }
  };
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); html += '<hr/>'; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const lvl = Math.min(h[1].length + 1, 4);
      html += `<h${lvl}>${inlineMd(h[2])}</h${lvl}>`;
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType !== 'ul') { flushList(); html += '<ul>'; listType = 'ul'; }
      html += `<li>${inlineMd(ul[1])}</li>`;
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType !== 'ol') { flushList(); html += '<ol>'; listType = 'ol'; }
      html += `<li>${inlineMd(ol[1])}</li>`;
      continue;
    }
    if (line.trim() === '') { flushPara(); flushList(); continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return html || '<p class="muted">Nothing here yet.</p>';
}

/* ================= api ================= */

let actor = localStorage.getItem('lhq_actor') || 'Jesutofunmi';
let state = null;

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body !== undefined && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    headers['X-Actor'] = actor;
    body = JSON.stringify(body);
  }
  const res = await fetch(path, { credentials: 'same-origin', ...options, headers, body });
  if (res.status === 401 && path !== '/api/auth') {
    showGate();
    throw new Error('Not signed in.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

async function loadState() {
  state = await api('/api/state');
  renderAll();
}

/* ================= gate / auth ================= */

function showGate() {
  $('#gate').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

function showApp() {
  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

$('#gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#gateError').textContent = '';
  try {
    await api('/api/auth', {
      method: 'POST',
      body: { passcode: $('#passcodeInput').value, actor },
    });
    $('#passcodeInput').value = '';
    showApp();
    await loadState();
  } catch (err) {
    $('#gateError').textContent = err.message === 'Incorrect passcode.' ? 'Incorrect passcode.' : err.message;
  }
});

$('#signOutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST', body: {} }); } catch { /* cookie may already be gone */ }
  state = null;
  showGate();
});

function syncActorCard() {
  $('#actorName').textContent = actor;
  $('#actorInitial').textContent = actor.charAt(0);
}

$('#actorSelect').addEventListener('change', (e) => {
  actor = e.target.value;
  localStorage.setItem('lhq_actor', actor);
  syncActorCard();
  // The report form's author follows whoever is acting, until picked otherwise.
  $('#reportAuthor').value = actor;
  reportFormDirty = false;
  refreshReportForm();
});

/* ================= navigation ================= */

function showView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`).classList.remove('hidden');
}

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  showView(btn.dataset.view);
});

/* ================= shared chips ================= */

function ownerChip(owner) {
  return `<span class="chip owner-${esc(owner)}">${esc(owner)}</span>`;
}

function dueChip(task) {
  if (!task.due) return '';
  if (task.status === 'done') return `<span class="chip due-done">Due ${fmtDate(task.due)}</span>`;
  const days = daysUntil(task.due);
  if (days < 0) return `<span class="chip due-overdue">Overdue · ${fmtDate(task.due)}</span>`;
  if (days === 0) return `<span class="chip due-soon">Due today</span>`;
  if (days <= 3) return `<span class="chip due-soon">Due ${fmtDate(task.due)}</span>`;
  return `<span class="chip due-normal">Due ${fmtDate(task.due)}</span>`;
}

/* ================= today ================= */

const ACTION_LABELS = {
  created: 'created a task',
  status_changed: 'changed a task status',
  updated: 'edited a task',
  digest_posted: 'posted a digest',
  deadline_added: 'added a deadline',
  deadline_updated: 'updated a deadline',
  report_posted: 'posted a daily report',
  project_added: 'added a project',
  project_updated: 'updated a project',
};

/* ---------- week calendar (This week card) ----------
   One Sunday–Saturday week at a time; weekOffset moves it with the
   chevrons. Days are real buttons: a click jumps to that date in the
   Deadlines view, flashing its rows — or landing on the nearest
   deadline when the day itself has none, so it never feels dead. */

let weekOffset = 0;

function renderWeekStrip() {
  if (!state) return;
  const deadlines = state.deadlines || [];
  const deadlineDates = new Set(deadlines.map((d) => d.date));
  const sunday = parseDay(todayStr());
  sunday.setDate(sunday.getDate() - sunday.getDay() + weekOffset * 7);
  const weekLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  let weekHtml = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const iso = isoOf(d);
    const count = deadlines.filter((x) => x.date === iso).length;
    const label = `${fmtDate(iso)}${count ? ` — ${count} deadline${count > 1 ? 's' : ''}` : ''}`;
    weekHtml += `<button type="button" class="week-day${iso === todayStr() ? ' today' : ''}" data-week-date="${iso}" aria-label="${esc(label)}" title="${esc(label)}"><span class="week-letter">${weekLetters[i]}</span><span class="week-num">${d.getDate()}</span>${deadlineDates.has(iso) ? '<span class="week-dot"></span>' : ''}</button>`;
  }
  $('#weekStrip').innerHTML = weekHtml;

  const end = new Date(sunday);
  end.setDate(sunday.getDate() + 6);
  const startLabel = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = sunday.getMonth() === end.getMonth()
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  $('#weekRange').textContent = `${startLabel} – ${endLabel}`;
}

function gotoDeadlineDate(iso) {
  showView('deadlines');
  const rows = [...document.querySelectorAll('#deadlineList .deadline-row')];
  rows.forEach((r) => r.classList.remove('flash'));
  const matches = rows.filter((r) => r.dataset.date === iso);
  let target = matches[0];
  if (!target) {
    const byDate = [...(state.deadlines || [])].sort((a, b) => a.date.localeCompare(b.date));
    const near = byDate.find((d) => d.date > iso) || byDate[byDate.length - 1];
    if (near) target = rows.find((r) => Number(r.dataset.deadlineId) === near.id);
  }
  if (!target) target = rows[0];
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (matches.length) {
    matches.forEach((r) => r.classList.add('flash'));
    setTimeout(() => matches.forEach((r) => r.classList.remove('flash')), 2500);
  }
}

$('#weekStrip').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-week-date]');
  if (btn) gotoDeadlineDate(btn.dataset.weekDate);
});
$('#weekPrev').addEventListener('click', () => { weekOffset -= 1; renderWeekStrip(); });
$('#weekNext').addEventListener('click', () => { weekOffset += 1; renderWeekStrip(); });
$('#deadlinesMore').addEventListener('click', () => showView('deadlines'));

// Relative chip for the Today deadlines card, tinted by closeness:
// rose for overdue/today/2 days out, butter for 3–4, grey beyond.
function relChip(d) {
  const days = daysUntil(d.date);
  if (days < 0) return `<span class="chip rel-rose">${Math.abs(days)}d overdue</span>`;
  if (days === 0) return '<span class="chip rel-rose">Today</span>';
  const label = days === 1 ? 'In 1 day' : `In ${days} days`;
  const tint = days <= 2 ? 'rel-rose' : days <= 4 ? 'rel-butter' : 'rel-grey';
  return `<span class="chip ${tint}">${label}</span>`;
}

function renderToday() {
  const tasks = state.tasks || [];
  const open = tasks.filter((t) => t.status !== 'done');
  const waiting = tasks.filter((t) => t.status === 'waiting');
  const weekAgo = Date.now() - 7 * 86400000;
  const doneWeek = tasks.filter((t) => t.status === 'done' && new Date(t.updated_at).getTime() >= weekAgo);
  // Priority order for the attention list: overdue first, then tasks
  // waiting on Jesutofunmi, then the rest — each group by due ascending.
  // The first row is therefore the day's top item; there is no separate
  // focus panel repeating it.
  const priorityGroup = (t) => (daysUntil(t.due) < 0 ? 0 : t.status === 'waiting' ? 1 : 2);
  const byPriority = (a, b) =>
    priorityGroup(a) - priorityGroup(b) || a.due.localeCompare(b.due);
  const dueNow = open
    .filter((t) => t.due && daysUntil(t.due) <= 3)
    .sort(byPriority);

  // Eyebrow: the real date (styled uppercase by CSS).
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthName = now.toLocaleDateString('en-US', { month: 'short' });
  $('#todayEyebrow').textContent = `${weekday}, ${monthName} ${now.getDate()}`;

  renderWeekStrip();

  // One quiet line of counts — these numbers live here and nowhere else.
  $('#statsRow').textContent =
    `${open.length} open · ${waiting.length} waiting on you · ${doneWeek.length} done this week`;

  // The Brief: the latest digest, white on deep green.
  const digest = state.latestDigest;
  if (digest) {
    $('#todayDigestTitle').textContent = digest.title;
    $('#todayDigestMeta').textContent = `${fmtDate(digest.date)} · by ${digest.created_by || 'Nayden'}`;
    $('#todayDigestBody').innerHTML = renderMarkdown(digest.body);
  } else {
    $('#todayDigestTitle').textContent = 'No digest yet';
    $('#todayDigestMeta').textContent = '';
    $('#todayDigestBody').innerHTML = '<p class="muted">The first brief will appear here.</p>';
  }

  // What deserves your attention: tasks-style rows. Clicking opens the editor.
  $('#attentionCount').textContent = dueNow.length ? String(dueNow.length) : '';
  $('#dueNowList').innerHTML = dueNow.length
    ? dueNow.map((t) => `
        <div class="attention-row" data-open-task="${t.id}" role="button" tabindex="0">
          <span class="att-circle" aria-hidden="true"></span>
          <div class="grow">
            <div class="att-title">${esc(t.title)}</div>
            <div class="att-meta"><span class="owner-dot owner-dot-${esc(t.owner)}"></span><span>${esc(t.owner)}${t.status === 'waiting' ? ' · waiting on you' : ''}</span></div>
          </div>
          ${dueChip(t)}
        </div>`).join('')
    : '<p class="muted">Nothing overdue, and nothing due in the next 72 hours.</p>';

  // Deadlines card: overdue and today's first, then the next ones out to
  // 14 days, five at most. Clicking a row jumps to it in Deadlines.
  const byDate = [...(state.deadlines || [])].sort((a, b) => a.date.localeCompare(b.date));
  const shownDeadlines = byDate.filter((d) => daysUntil(d.date) <= 14).slice(0, 5);
  $('#todayDeadlines').innerHTML = shownDeadlines.length
    ? shownDeadlines.map((d) => {
        const dt = parseDay(d.date);
        const context = [d.owner, d.notes].filter(Boolean).join(' · ');
        return `
        <div class="dl-row" data-goto-deadline="${esc(d.date)}">
          <div class="dl-date">
            <span class="dl-mon">${dt.toLocaleDateString('en-US', { month: 'short' })}</span>
            <span class="dl-day">${dt.getDate()}</span>
          </div>
          <div class="grow">
            <div class="dl-title">${esc(d.title)}</div>
            ${context ? `<div class="dl-context">${esc(context)}</div>` : ''}
          </div>
          ${relChip(d)}
        </div>`;
      }).join('')
    : '<p class="muted">No deadlines in the next 14 days.</p>';

  // Under the week strip: whatever is dated today — deadlines due today
  // first, then open tasks due today — as tinted blocks.
  const t = todayStr();
  const dlToday = (state.deadlines || []).filter((d) => d.date === t);
  const tasksToday = open.filter((x) => x.due === t);
  const tintCycle = ['tint-sage', 'tint-butter', 'tint-rose'];
  const blocks = [
    ...dlToday.map((d) => ({ title: d.title, sub: `Deadline · ${d.owner}` })),
    ...tasksToday.map((x) => ({ title: x.title, sub: `Task · ${x.owner}` })),
  ];
  $('#todayItems').innerHTML = blocks.length
    ? blocks.map((b, i) => `
        <div class="today-item ${tintCycle[i % tintCycle.length]}">
          <div class="ti-title">${esc(b.title)}</div>
          <div class="ti-sub">${esc(b.sub)}</div>
        </div>`).join('')
    : '<p class="muted today-items-empty">Nothing dated today.</p>';

  $('#activityList').innerHTML = (state.activity || []).length
    ? state.activity.map((a) => `
        <div class="activity-item">
          <div class="grow"><span class="actor">${esc(a.actor)}</span> ${esc(ACTION_LABELS[a.action] || a.action)}${a.note ? ` — ${esc(a.note)}` : ''}</div>
          <span class="muted">${esc(fmtDateTime(a.created_at))}</span>
        </div>`).join('')
    : '<p class="muted">No activity yet.</p>';
}

// Today deadlines-card rows jump to the date in the Deadlines view.
$('#todayDeadlines').addEventListener('click', (e) => {
  const row = e.target.closest('[data-goto-deadline]');
  if (row) gotoDeadlineDate(row.dataset.gotoDeadline);
});

/* ================= calendar ================= */

let calOffset = 0; // months away from the current month

function renderCalendar() {
  if (!state) return;
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + calOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  $('#calTitle').textContent = base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const dlByDate = {};
  (state.deadlines || []).forEach((d) => { (dlByDate[d.date] = dlByDate[d.date] || []).push(d); });
  const taskByDate = {};
  (state.tasks || [])
    .filter((x) => x.due && x.status !== 'done')
    .forEach((x) => { (taskByDate[x.due] = taskByDate[x.due] || []).push(x); });

  const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoOf(d);
    const inMonth = d.getMonth() === month;
    const dls = dlByDate[iso] || [];
    const tks = taskByDate[iso] || [];
    const chips = dls.slice(0, 2)
      .map((x) => `<span class="cal-chip">${esc(x.title)}</span>`).join('') +
      (dls.length > 2 ? `<span class="cal-more">+${dls.length - 2} more</span>` : '');
    const dots = tks.length
      ? `<span class="cal-dots">${'<i></i>'.repeat(Math.min(3, tks.length))}</span>`
      : '';
    const label = `${fmtDate(iso)}${dls.length ? ` — ${dls.length} deadline${dls.length > 1 ? 's' : ''}` : ''}`;
    html += `<div class="cal-cell${inMonth ? '' : ' out'}${iso === todayStr() ? ' is-today' : ''}${dls.length ? ' has-deadline' : ''}"${dls.length ? ` data-cal-date="${iso}" role="button" tabindex="0" aria-label="${esc(label)}" title="${esc(label)}"` : ''}>
      <div class="cal-cell-top"><span class="cal-num">${d.getDate()}</span>${dots}</div>
      ${chips ? `<div class="cal-chips">${chips}</div>` : ''}
    </div>`;
  }
  $('#calGrid').innerHTML = html;
}

$('#calGrid').addEventListener('click', (e) => {
  const cell = e.target.closest('[data-cal-date]');
  if (cell) gotoDeadlineDate(cell.dataset.calDate);
});
$('#calGrid').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const cell = e.target.closest('[data-cal-date]');
  if (cell) { e.preventDefault(); gotoDeadlineDate(cell.dataset.calDate); }
});
$('#calPrev').addEventListener('click', () => { calOffset -= 1; renderCalendar(); });
$('#calNext').addEventListener('click', () => { calOffset += 1; renderCalendar(); });
$('#calTodayBtn').addEventListener('click', () => { calOffset = 0; renderCalendar(); });

/* ================= board ================= */

const STATUS_ORDER = ['todo', 'doing', 'waiting', 'done'];
let draggedTaskId = null;
let justDragged = false;

function taskById(id) {
  return (state.tasks || []).find((t) => t.id === Number(id));
}

function renderBoard() {
  const filter = $('#ownerFilter').value;
  for (const status of STATUS_ORDER) {
    const col = document.querySelector(`[data-col="${status}"]`);
    let tasks = (state.tasks || []).filter((t) => t.status === status);
    if (filter) tasks = tasks.filter((t) => t.owner === filter);
    tasks.sort((a, b) => {
      if (a.due && b.due) return a.due.localeCompare(b.due) || a.id - b.id;
      if (a.due) return -1;
      if (b.due) return 1;
      return a.id - b.id;
    });
    document.querySelector(`[data-count="${status}"]`).textContent =
      `· ${(state.tasks || []).filter((t) => t.status === status).length}`;
    col.innerHTML = tasks.length
      ? tasks.map((t) => `
          <article class="task-card" draggable="true" data-task-id="${t.id}">
            <div class="task-title">${esc(t.title)}</div>
            <div class="task-meta">${ownerChip(t.owner)}${dueChip(t)}</div>
            ${t.evidence ? `<div class="task-evidence">&#10003; ${esc(t.evidence)}</div>` : ''}
          </article>`).join('')
      : '<div class="col-empty">Nothing here.</div>';
  }

  col_bindDrag();
}

function col_bindDrag() {
  document.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      draggedTaskId = card.dataset.taskId;
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.taskId);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 150);
    });
    card.addEventListener('click', () => {
      if (justDragged) return;
      const task = taskById(card.dataset.taskId);
      if (task) openTaskEditor(task);
    });
  });
  document.querySelectorAll('.column').forEach((column) => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain') || draggedTaskId;
      const task = taskById(id);
      const status = column.dataset.status;
      if (!task || task.status === status) return;
      try {
        await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status, actor } });
        await loadState();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

$('#ownerFilter').addEventListener('change', renderBoard);

// Attention rows open the task editor (click, or Enter when focused).
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-open-task]');
  if (!link) return;
  e.preventDefault();
  const task = taskById(link.dataset.openTask);
  if (task) openTaskEditor(task);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const link = e.target.closest && e.target.closest('[data-open-task]');
  if (!link) return;
  e.preventDefault();
  const task = taskById(link.dataset.openTask);
  if (task) openTaskEditor(task);
});

/* ================= task editor ================= */

function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { $(`#${id}`).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
});

function openTaskEditor(task) {
  $('#taskFormTitle').textContent = task ? 'Edit task' : 'New task';
  $('#taskId').value = task ? task.id : '';
  $('#taskTitle').value = task ? task.title : '';
  $('#taskDetails').value = task ? task.details || '' : '';
  $('#taskOwner').value = task ? task.owner : 'Unassigned';
  $('#taskStatus').value = task ? task.status : 'todo';
  $('#taskDue').value = task && task.due ? task.due : '';
  $('#taskEvidence').value = task ? task.evidence || '' : '';
  $('#taskError').textContent = '';
  openModal('taskModal');
}

$('#newTaskBtn').addEventListener('click', () => openTaskEditor(null));
$('#newTaskBtnToday').addEventListener('click', () => openTaskEditor(null));

$('#taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#taskError').textContent = '';
  const id = $('#taskId').value;
  const payload = {
    title: $('#taskTitle').value.trim(),
    details: $('#taskDetails').value,
    owner: $('#taskOwner').value,
    status: $('#taskStatus').value,
    due: $('#taskDue').value || null,
    evidence: $('#taskEvidence').value.trim(),
    actor,
  };
  if (payload.status === 'done' && !payload.evidence) {
    $('#taskError').textContent = 'Board rule: Done needs evidence — add a link or the confirmation wording first.';
    return;
  }
  try {
    if (id) await api(`/api/tasks/${id}`, { method: 'PATCH', body: payload });
    else await api('/api/tasks', { method: 'POST', body: payload });
    closeModal('taskModal');
    await loadState();
  } catch (err) {
    $('#taskError').textContent = err.message;
  }
});

/* ================= deadlines ================= */

function deadlineChip(d) {
  const days = daysUntil(d.date);
  if (days < 0) return `<span class="chip due-overdue">${Math.abs(days)}d overdue</span>`;
  if (days === 0) return '<span class="chip due-soon">Today</span>';
  if (days <= 3) return `<span class="chip due-soon">In ${days}d</span>`;
  return `<span class="chip due-normal">In ${days}d</span>`;
}

function renderDeadlines() {
  const list = state.deadlines || [];
  $('#deadlineList').innerHTML = list.length
    ? list.map((d) => {
        const dt = parseDay(d.date);
        return `
        <div class="deadline-row ${daysUntil(d.date) < 0 ? 'past' : ''}" data-deadline-id="${d.id}" data-date="${esc(d.date)}">
          <div class="deadline-date">
            <span class="d-mon">${dt.toLocaleDateString('en-US', { month: 'short' })}</span>
            <span class="d-day">${dt.getDate()}</span>
          </div>
          <div class="deadline-main">
            <div class="deadline-title">${esc(d.title)}</div>
            ${d.notes ? `<div class="deadline-notes">${esc(d.notes)}</div>` : ''}
          </div>
          ${ownerChip(d.owner)}${deadlineChip(d)}
        </div>`;
      }).join('')
    : '<p class="muted">No deadlines recorded.</p>';

  document.querySelectorAll('[data-deadline-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const d = (state.deadlines || []).find((x) => x.id === Number(row.dataset.deadlineId));
      if (d) openDeadlineEditor(d);
    });
  });
}

function openDeadlineEditor(d) {
  $('#deadlineFormTitle').textContent = d ? 'Edit deadline' : 'Add deadline';
  $('#deadlineId').value = d ? d.id : '';
  $('#deadlineTitle').value = d ? d.title : '';
  $('#deadlineDate').value = d ? d.date : '';
  $('#deadlineOwner').value = d ? d.owner : 'Jesutofunmi';
  $('#deadlineNotes').value = d ? d.notes || '' : '';
  $('#deadlineError').textContent = '';
  openModal('deadlineModal');
}

$('#newDeadlineBtn').addEventListener('click', () => openDeadlineEditor(null));

$('#deadlineForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#deadlineError').textContent = '';
  const id = $('#deadlineId').value;
  const payload = {
    title: $('#deadlineTitle').value.trim(),
    date: $('#deadlineDate').value,
    owner: $('#deadlineOwner').value,
    notes: $('#deadlineNotes').value,
    actor,
  };
  try {
    if (id) await api(`/api/deadlines/${id}`, { method: 'PATCH', body: payload });
    else await api('/api/deadlines', { method: 'POST', body: payload });
    closeModal('deadlineModal');
    await loadState();
  } catch (err) {
    $('#deadlineError').textContent = err.message;
  }
});

/* ================= projects ================= */

const PROJECT_DOT_COLORS = ['#966a43', '#234d3b', '#c39a1d', '#7d8c6f', '#a34d3c', '#5b7a99'];

function projectStatusChip(status) {
  const map = {
    active: ['status-active', 'Active'],
    paused: ['status-paused', 'Paused'],
    done: ['status-done', 'Done'],
  };
  const [cls, label] = map[status] || map.active;
  return `<span class="chip ${cls}">${label}</span>`;
}

function renderProjects() {
  const projects = state.projects || [];

  // Sidebar PROJECTS group: quiet dot-and-name rows, data-driven; the
  // whole group hides when there are no projects.
  const group = $('#projectNavGroup');
  if (projects.length) {
    group.classList.remove('hidden');
    $('#projectNav').innerHTML = projects.map((p, i) => `
      <button type="button" class="project-nav-item" data-goto-projects>
        <span class="project-dot" style="background:${PROJECT_DOT_COLORS[i % PROJECT_DOT_COLORS.length]}"></span>
        <span class="project-nav-name">${esc(p.name)}</span>
      </button>`).join('');
  } else {
    group.classList.add('hidden');
    $('#projectNav').innerHTML = '';
  }

  // The Projects view: one paper card per project; clicking opens the editor.
  $('#projectList').innerHTML = projects.length
    ? projects.map((p) => `
        <article class="card project-card" data-project-id="${p.id}">
          <div class="project-card-head"><h3 class="project-name">${esc(p.name)}</h3>${projectStatusChip(p.status)}</div>
          ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
        </article>`).join('')
    : '<p class="muted">No projects yet.</p>';

  document.querySelectorAll('[data-project-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const p = projects.find((x) => x.id === Number(card.dataset.projectId));
      if (p) openProjectEditor(p);
    });
  });
}

$('#projectNav').addEventListener('click', (e) => {
  if (e.target.closest('[data-goto-projects]')) showView('projects');
});

function openProjectEditor(p) {
  $('#projectFormTitle').textContent = p ? 'Edit project' : 'Add project';
  $('#projectId').value = p ? p.id : '';
  $('#projectName').value = p ? p.name : '';
  $('#projectDescription').value = p ? p.description || '' : '';
  $('#projectStatus').value = p ? p.status : 'active';
  $('#projectError').textContent = '';
  openModal('projectModal');
}

$('#newProjectBtn').addEventListener('click', () => openProjectEditor(null));

$('#projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#projectError').textContent = '';
  const id = $('#projectId').value;
  const payload = {
    name: $('#projectName').value.trim(),
    description: $('#projectDescription').value,
    status: $('#projectStatus').value,
    actor,
  };
  try {
    if (id) await api(`/api/projects/${id}`, { method: 'PATCH', body: payload });
    else await api('/api/projects', { method: 'POST', body: payload });
    closeModal('projectModal');
    await loadState();
  } catch (err) {
    $('#projectError').textContent = err.message;
  }
});

/* ================= reports ================= */

const REPORT_AUTHORS = ['Jesutofunmi', 'Nayden', 'Claude', 'ChatGPT', 'Instinct'];
const toggledReportDays = new Set(); // days whose open/closed state the user flipped
let reportFormDirty = false;

function reportFor(date, author) {
  return ((state && state.reports) || []).find((r) => r.date === date && r.author === author) || null;
}

function reportDayOpen(iso) {
  const dflt = iso === todayStr(); // today starts open, earlier days closed
  return toggledReportDays.has(iso) ? !dflt : dflt;
}

function renderReports() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = parseDay(todayStr());
    d.setDate(d.getDate() - i);
    days.push(isoOf(d));
  }
  $('#reportDays').innerHTML = days.map((iso) => {
    const open = reportDayOpen(iso);
    const inCount = REPORT_AUTHORS.filter((a) => reportFor(iso, a)).length;
    const label = parseDay(iso).toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' });
    const slots = REPORT_AUTHORS.map((author) => {
      const r = reportFor(iso, author);
      const postedBy = r && r.created_by && r.created_by !== r.author
        ? `<span class="muted">posted by ${esc(r.created_by)}</span>`
        : '';
      const editBtn = r
        ? `<span class="grow"></span><button type="button" class="btn btn-ghost btn-small" data-edit-report="${iso}|${author}">Edit</button>`
        : '';
      return `
        <div class="report-slot">
          <div class="report-slot-head">${ownerChip(author)}${postedBy}${editBtn}</div>
          ${r ? `<div class="markdown">${renderMarkdown(r.body)}</div>` : '<p class="muted report-missing">No report yet.</p>'}
        </div>`;
    }).join('');
    return `
      <div class="card report-day${open ? '' : ' closed'}">
        <button type="button" class="report-day-head" data-report-day="${iso}">
          <span class="report-day-title">${esc(label)}${iso === todayStr() ? ' <span class="muted">· today</span>' : ''}</span>
          <span class="report-day-meta"><span class="muted">${inCount} of 5 in</span><span class="report-toggle">${open ? 'Hide' : 'Show'}</span></span>
        </button>
        <div class="report-slots">${slots}</div>
      </div>`;
  }).join('');

  document.querySelectorAll('[data-report-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iso = btn.dataset.reportDay;
      if (toggledReportDays.has(iso)) toggledReportDays.delete(iso);
      else toggledReportDays.add(iso);
      renderReports();
    });
  });
  document.querySelectorAll('[data-edit-report]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [iso, author] = btn.dataset.editReport.split('|');
      $('#reportDate').value = iso;
      $('#reportAuthor').value = author;
      reportFormDirty = false;
      refreshReportForm();
      $('#reportForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// Loads the existing report for the form's date+author (if any) into the
// textarea. Never overwrites text the user has started typing.
function refreshReportForm() {
  if (!state || reportFormDirty) return;
  const date = $('#reportDate').value || todayStr();
  const author = $('#reportAuthor').value || actor;
  const existing = reportFor(date, author);
  $('#reportBody').value = existing ? existing.body : '';
  $('#reportSubmitBtn').textContent = existing ? 'Update report' : 'Post report';
}

$('#reportDate').addEventListener('change', () => { reportFormDirty = false; refreshReportForm(); });
$('#reportAuthor').addEventListener('change', () => { reportFormDirty = false; refreshReportForm(); });
$('#reportBody').addEventListener('input', () => { reportFormDirty = true; });

$('#reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#reportError').textContent = '';
  const payload = {
    date: $('#reportDate').value || todayStr(),
    author: $('#reportAuthor').value,
    body: $('#reportBody').value,
    actor,
  };
  try {
    await api('/api/reports', { method: 'POST', body: payload });
    reportFormDirty = false;
    await loadState();
    refreshReportForm();
  } catch (err) {
    $('#reportError').textContent = err.message;
  }
});

/* ================= render all / init ================= */

function renderAll() {
  renderToday();
  renderBoard();
  renderCalendar();
  renderDeadlines();
  renderProjects();
  renderReports();
  refreshReportForm();
}

(function init() {
  const sel = $('#actorSelect');
  sel.value = actor;
  if (sel.value !== actor) { actor = 'Jesutofunmi'; sel.value = actor; }
  syncActorCard();
  $('#reportDate').value = todayStr();
  $('#reportAuthor').value = actor;
  loadState()
    .then(() => showApp())
    .catch(() => showGate());
})();
