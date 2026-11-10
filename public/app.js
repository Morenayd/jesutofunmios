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

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${btn.dataset.view}`).classList.remove('hidden');
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
};

function renderToday() {
  const tasks = state.tasks || [];
  const open = tasks.filter((t) => t.status !== 'done');
  const waiting = tasks.filter((t) => t.status === 'waiting');
  const weekAgo = Date.now() - 7 * 86400000;
  const doneWeek = tasks.filter((t) => t.status === 'done' && new Date(t.updated_at).getTime() >= weekAgo);
  // Priority order, shared by the attention list and Today's focus:
  // overdue first, then tasks waiting on Jesutofunmi, then the rest —
  // each group by due date ascending.
  const priorityGroup = (t) => (daysUntil(t.due) < 0 ? 0 : t.status === 'waiting' ? 1 : 2);
  const byPriority = (a, b) =>
    priorityGroup(a) - priorityGroup(b) || a.due.localeCompare(b.due);
  const dueNow = open
    .filter((t) => t.due && daysUntil(t.due) <= 3)
    .sort(byPriority);

  // Hero: eyebrow from the real date + a greeting matched to the time of day.
  const now = new Date();
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const monthName = now.toLocaleDateString('en-GB', { month: 'long' });
  $('#todayEyebrow').textContent = `${weekday}, ${monthName} ${now.getDate()}`;
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('#heroTitle').innerHTML = `${greeting}, <em>Jesutofunmi.</em>`;
  $('#todayGreeting').textContent = hour < 12
    ? 'A little clarity before the day begins.'
    : hour < 18
      ? 'A quiet look at where things stand.'
      : 'A quiet look back at the day, and at what tomorrow asks.';

  // Week strip: Sunday–Saturday of the current week; dots mark deadline days.
  const deadlineDates = new Set((state.deadlines || []).map((d) => d.date));
  const sunday = parseDay(todayStr());
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const weekLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  let weekHtml = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weekHtml += `<div class="week-day${iso === todayStr() ? ' today' : ''}"><span class="week-letter">${weekLetters[i]}</span><span class="week-num">${d.getDate()}</span>${deadlineDates.has(iso) ? '<span class="week-dot"></span>' : ''}</div>`;
  }
  $('#weekStrip').innerHTML = weekHtml;

  // One quiet line of counts — these numbers live here and nowhere else.
  $('#statsRow').textContent =
    `${open.length} open · ${waiting.length} waiting on you · ${doneWeek.length} done this week`;

  const digest = state.latestDigest;
  if (digest) {
    $('#todayDigestTitle').textContent = digest.title;
    $('#todayDigestMeta').textContent = `${fmtDate(digest.date)} · by ${digest.created_by || 'Nayden'}`;
    $('#todayDigestBody').innerHTML = renderMarkdown(digest.body);
  } else {
    $('#todayDigestTitle').textContent = 'No digest yet';
    $('#todayDigestMeta').textContent = '';
    $('#todayDigestBody').innerHTML = '<p class="muted">The first digest will appear here.</p>';
  }

  // What deserves your attention: a numbered editorial list — its only home.
  $('#dueNowList').innerHTML = dueNow.length
    ? dueNow.map((t, i) => `
        <div class="attention-item">
          <span class="att-num">${String(i + 1).padStart(2, '0')}</span>
          <div class="grow"><a href="#" data-open-task="${t.id}">${esc(t.title)}</a></div>
          ${ownerChip(t.owner)}${dueChip(t)}
        </div>`).join('')
    : '<p class="muted">Nothing overdue, and nothing due in the next 72 hours.</p>';

  // Today's focus: the same priority order as the attention list, so the
  // focus is attention item 01 whenever that list is non-empty — the list
  // flags it, this panel commits to it.
  const focus = open
    .filter((t) => t.due)
    .sort(byPriority)[0];
  $('#focusLine').innerHTML = focus
    ? `<div class="focus-line">
        <div class="grow"><a href="#" data-open-task="${focus.id}">${esc(focus.title)}</a></div>
        ${ownerChip(focus.owner)}${dueChip(focus)}
      </div>`
    : '<p class="muted">Nothing is pressing today.</p>';

  // On the horizon: the next few deadlines after today.
  const horizon = (state.deadlines || [])
    .filter((d) => daysUntil(d.date) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  $('#horizonList').innerHTML = horizon.length
    ? horizon.map((d) => `
        <div class="horizon-item">
          <span class="h-date">${esc(fmtDate(d.date))}</span>
          <div class="grow">${esc(d.title)}</div>
          ${ownerChip(d.owner)}
        </div>`).join('')
    : '<p class="muted">No deadlines on the horizon.</p>';

  $('#activityList').innerHTML = (state.activity || []).length
    ? state.activity.map((a) => `
        <div class="activity-item">
          <div class="grow"><span class="actor">${esc(a.actor)}</span> ${esc(ACTION_LABELS[a.action] || a.action)}${a.note ? ` — ${esc(a.note)}` : ''}</div>
          <span class="muted">${esc(fmtDateTime(a.created_at))}</span>
        </div>`).join('')
    : '<p class="muted">No activity yet.</p>';
}

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

// "Due now" rows open the same editor.
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-open-task]');
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
        <div class="deadline-row ${daysUntil(d.date) < 0 ? 'past' : ''}" data-deadline-id="${d.id}">
          <div class="deadline-date">
            <div class="d-day">${dt.getDate()}</div>
            <div class="d-mon">${dt.toLocaleDateString('en-US', { month: 'short' })}</div>
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

/* ================= digests ================= */

let selectedDigestId = null;

async function showDigest(id) {
  selectedDigestId = id;
  document.querySelectorAll('.digest-item').forEach((el) => {
    el.classList.toggle('selected', Number(el.dataset.digestId) === id);
  });
  let digest = state.latestDigest && state.latestDigest.id === id ? state.latestDigest : null;
  if (!digest) {
    try {
      const res = await api(`/api/digests/${id}`);
      digest = res.digest;
    } catch {
      return;
    }
  }
  if (!digest) return;
  $('#digestViewTitle').textContent = digest.title;
  $('#digestViewMeta').textContent = `${fmtDate(digest.date)} · by ${digest.created_by || 'Nayden'}`;
  $('#digestViewBody').innerHTML = renderMarkdown(digest.body);
}

function renderDigests() {
  const list = state.digests || [];
  $('#digestList').innerHTML = list.length
    ? list.map((d) => `
        <div class="digest-item" data-digest-id="${d.id}">
          <div class="d-title">${esc(d.title)}</div>
          <div class="d-meta">${esc(d.date)} · by ${esc(d.created_by || 'Nayden')}</div>
        </div>`).join('')
    : '<p class="muted">No digests yet.</p>';
  document.querySelectorAll('.digest-item').forEach((el) => {
    el.addEventListener('click', () => showDigest(Number(el.dataset.digestId)));
  });
  if (list.length) {
    const keep = selectedDigestId && list.some((d) => d.id === selectedDigestId);
    showDigest(keep ? selectedDigestId : list[0].id);
  }
}

$('#digestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#digestError').textContent = '';
  const payload = {
    title: $('#digestTitle').value.trim(),
    body: $('#digestBody').value,
    actor,
  };
  if ($('#digestDate').value) payload.date = $('#digestDate').value;
  try {
    const res = await api('/api/digests', { method: 'POST', body: payload });
    selectedDigestId = res.digest.id;
    $('#digestTitle').value = '';
    $('#digestBody').value = '';
    await loadState();
  } catch (err) {
    $('#digestError').textContent = err.message;
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
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
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
  renderDeadlines();
  renderReports();
  refreshReportForm();
  renderDigests();
}

(function init() {
  const sel = $('#actorSelect');
  sel.value = actor;
  if (sel.value !== actor) { actor = 'Jesutofunmi'; sel.value = actor; }
  syncActorCard();
  $('#digestDate').value = todayStr();
  $('#reportDate').value = todayStr();
  $('#reportAuthor').value = actor;
  loadState()
    .then(() => showApp())
    .catch(() => showGate());
})();
