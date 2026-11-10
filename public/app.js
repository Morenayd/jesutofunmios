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

// Jump to a date in the Deadlines view, flashing its rows — or landing
// on the nearest deadline when the day itself has none. Used by the
// Today Deadlines card. (The Calendar view renders day detail in place.)
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

$('#deadlinesMore').addEventListener('click', () => showView('deadlines'));
$('#todayTasksMore').addEventListener('click', () => showView('board'));

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

  // Eyebrow: the real date (styled uppercase by CSS).
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthName = now.toLocaleDateString('en-US', { month: 'short' });
  $('#todayEyebrow').textContent = `${weekday}, ${monthName} ${now.getDate()}`;

  // The Brief: the latest digest, white on deep green. The digest's
  // title is an internal label only — the panel shows the Brief label,
  // the date · author meta, and the body. No headline.
  const digest = state.latestDigest;
  if (digest) {
    $('#todayDigestMeta').textContent = `${fmtDate(digest.date)} · by ${digest.created_by || 'Nayden'}`;
    $('#todayDigestBody').innerHTML = renderMarkdown(digest.body);
  } else {
    $('#todayDigestMeta').textContent = '';
    $('#todayDigestBody').innerHTML = '<p class="muted">The first brief will appear here.</p>';
  }

  // Tasks card: open tasks in priority order — overdue first, then tasks
  // waiting on Jesutofunmi, then the rest, each group by due date (no due
  // date last). Six rows at most; the rest sit behind "View all". The
  // circle does not complete anything (Done needs evidence) — the whole
  // row, circle included, opens the task editor.
  const priorityGroup = (t) => (t.due && daysUntil(t.due) < 0 ? 0 : t.status === 'waiting' ? 1 : 2);
  const byPriority = (a, b) =>
    priorityGroup(a) - priorityGroup(b) ||
    (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') ||
    a.id - b.id;
  const shownTasks = [...open].sort(byPriority).slice(0, 6);
  $('#todayTasksCount').textContent = open.length ? String(open.length) : '';
  $('#todayTasks').innerHTML = shownTasks.length
    ? shownTasks.map((t) => {
        const meta = [esc(t.owner)];
        if (t.due) {
          const days = daysUntil(t.due);
          meta.push(days < 0 ? 'Overdue' : days === 0 ? 'Due today' : `Due ${fmtDate(t.due)}`);
        }
        if (priorityGroup(t) < 2) meta.push('<span class="priority-tag">Priority</span>');
        return `
        <div class="attention-row" data-open-task="${t.id}" role="button" tabindex="0">
          <span class="att-circle" aria-hidden="true"></span>
          <div class="grow">
            <div class="att-title">${esc(t.title)}</div>
            <div class="att-meta"><span class="owner-dot owner-dot-${esc(t.owner)}"></span><span>${meta.join(' · ')}</span></div>
          </div>
          ${dueChip(t)}
        </div>`;
      }).join('')
    : '<p class="muted">Nothing open right now.</p>';
  $('#todayTasksFoot').classList.toggle('hidden', open.length <= 6);

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

  renderSchedule();
  renderWeekStrip();
}

/* ---------- schedule card ----------
   Today's schedule: events first (the day's fixed appointments —
   classes and sessions), then deadlines due today, then open tasks due
   today, as tinted blocks. The time gutter is honest: a time shows only
   when the item itself carries one (an event's time field, or a time in
   a deadline/task title or notes, e.g. "6:00–8:00 PM CT") — never an
   invented one. */

function extractTime(text) {
  if (!text) return null;
  const s = String(text);
  const toMinutes = (h, min, mer) =>
    mer ? ((h % 12) + (mer === 'PM' ? 12 : 0)) * 60 + min : h * 60 + min;
  const label = (h, min, mer) =>
    mer ? `${h}:${String(min).padStart(2, '0')} ${mer}` : `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  // Range first: a trailing AM/PM on the range end applies to the start.
  let m = s.match(/(\d{1,2}):(\d{2})\s*(?:–|—|-|\bto\b)\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    const mer = m[5] ? m[5].toUpperCase() : null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return { label: label(h, min, mer), minutes: toMinutes(h, min, mer) };
  }
  m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  const mer = m[3] ? m[3].toUpperCase() : null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return { label: label(h, min, mer), minutes: toMinutes(h, min, mer) };
}

// Remove time expressions (and timezone tags) from a detail line so what
// remains can sit beside the time in the gutter without repeating it.
function stripTimes(text) {
  return String(text || '')
    .replace(/\d{1,2}:\d{2}\s*(?:–|—|-|\bto\b)\s*\d{1,2}:\d{2}\s*(AM|PM)?/gi, '')
    .replace(/\d{1,2}:\d{2}\s*(AM|PM)?/gi, '')
    .replace(/\b(CT|ET|PT|MT|CST|EST|PST|MST|CDT|EDT|PDT|MDT)\b/g, '')
    .replace(/^[~\s,;·—-]+|[~\s,;·—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function renderSchedule() {
  const t = todayStr();
  const items = [];
  // Events first: classes and sessions are the day's fixed appointments.
  (state.events || []).filter((e) => e.date === t).forEach((e) => {
    const time = extractTime(e.time || '');
    const rest = stripTimes(e.notes || '');
    items.push({ group: 0, title: e.title, sub: rest || 'Scheduled', time });
  });
  (state.deadlines || []).filter((d) => d.date === t).forEach((d) => {
    const time = extractTime(`${d.title} ${d.notes || ''}`);
    const rest = stripTimes(d.notes || '');
    items.push({ group: 1, title: d.title, sub: rest || `Deadline · ${d.owner}`, time });
  });
  (state.tasks || []).filter((x) => x.status !== 'done' && x.due === t).forEach((x) => {
    const time = extractTime(`${x.title} ${x.details || ''}`);
    items.push({
      group: 2,
      title: x.title,
      sub: `Task · ${x.owner}${x.status === 'waiting' ? ' · waiting on you' : ''}`,
      time,
    });
  });
  // Group order first (events, deadlines, tasks); within a group, timed
  // items first in time order, untimed last.
  items.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.time && b.time) return a.time.minutes - b.time.minutes;
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });
  const tints = ['tint-sage', 'tint-butter', 'tint-rose'];
  $('#scheduleList').innerHTML = items.length
    ? items.map((it, i) => `
        <div class="sched-row">
          <span class="sched-time">${it.time ? esc(it.time.label) : ''}</span>
          <div class="sched-block ${tints[i % tints.length]}">
            <div class="ti-title">${esc(it.title)}</div>
            <div class="ti-sub">${esc(it.sub)}</div>
          </div>
        </div>`).join('')
    : '<p class="muted">Nothing scheduled today.</p>';
}

/* ---------- week strip (Today rail) ----------
   The current week, Monday to Sunday, in a card under the Deadlines
   card. Selecting a day renders its detail inside the same card, under
   the strip — the strip never navigates anywhere. */

let weekSelected = null; // iso of the day whose detail shows under the strip

function renderWeekStrip() {
  if (!state) return;
  const today = todayStr();
  // Monday of the current week.
  const monday = parseDay(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const mondayIso = isoOf(monday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayIso = isoOf(sunday);
  // Keep the selection while it sits in this week; otherwise fall back
  // to today, so the detail under the strip never goes stale.
  if (!weekSelected || weekSelected < mondayIso || weekSelected > sundayIso) {
    weekSelected = today;
  }
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = isoOf(d);
    const evCount = (state.events || []).filter((x) => x.date === iso).length;
    const dlCount = (state.deadlines || []).filter((x) => x.date === iso).length;
    const tkCount = (state.tasks || []).filter((x) => x.due === iso && x.status !== 'done').length;
    const label = `${fmtDate(iso)}${evCount ? ` — ${evCount} event${evCount > 1 ? 's' : ''}` : ''}${dlCount ? ` — ${dlCount} deadline${dlCount > 1 ? 's' : ''}` : ''}${tkCount ? ` — ${tkCount} open task${tkCount > 1 ? 's' : ''} due` : ''}`;
    html += `<button type="button" class="week-day${iso === today ? ' is-today' : ''}${iso === weekSelected ? ' selected' : ''}" data-week-date="${iso}" aria-label="${esc(label)}" title="${esc(label)}"><span class="week-letter">${letters[i]}</span><span class="week-num">${d.getDate()}</span><span class="week-dot${evCount || dlCount || tkCount ? '' : ' empty'}" aria-hidden="true"></span></button>`;
  }
  $('#weekStrip').innerHTML = html;
  renderWeekDayDetail();
}

function renderWeekDayDetail() {
  const iso = weekSelected || todayStr();
  $('#weekDayTitle').textContent = parseDay(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  $('#weekDayItems').innerHTML = dayItemsHtml(iso);
}

// Selection updates classes in place rather than re-rendering the
// strip, so keyboard focus is never lost. Buttons fire click on
// Enter/Space natively, so this one handler covers keyboard too.
function selectWeekDay(iso) {
  weekSelected = iso;
  document.querySelectorAll('#weekStrip .week-day').forEach((c) => {
    c.classList.toggle('selected', c.dataset.weekDate === iso);
  });
  renderWeekDayDetail();
}

$('#weekStrip').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-week-date]');
  if (btn) selectWeekDay(btn.dataset.weekDate);
});

/* ================= goals & the monthly target ================= */

// The monthly target is a goal like any other — the one flagged
// is_monthly_target. The Today banner reads it from here, and the
// Goals section is its only editor.
function activeGoal() {
  const goals = (state && state.goals) || [];
  return goals.find((g) => Number(g.is_monthly_target) === 1) || null;
}

function renderMonthlyTarget() {
  const goal = activeGoal();
  const banner = $('#targetBanner');
  if (goal) {
    banner.classList.remove('hidden');
    const dueLabel = goal.due_date
      ? parseDay(goal.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'no date set';
    $('#targetEyebrow').textContent = `Monthly target · ${dueLabel}`;
    $('#targetLabel').textContent = goal.title;
    $('#targetProgress').textContent = goal.total !== null && goal.total !== undefined
      ? `${goal.current ?? 0} / ${goal.total} published`
      : '';
  } else {
    banner.classList.add('hidden');
  }
}

$('#targetBanner').addEventListener('click', () => showView('goals'));

// A goal card's footer: a progress row when the goal carries a total,
// otherwise a milestone/due chip — rose when the nearest of the two
// dates is within 3 days (and not past), grey further out. When the
// goal has neither a total nor a date, there is no footer.
function goalFooterHtml(g) {
  if (g.total !== null && g.total !== undefined) {
    const total = Number(g.total);
    const current = Number(g.current ?? 0);
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const width = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
    return `
      <div class="goal-progress-meta"><span>${current} of ${total}</span><span>${pct}%</span></div>
      <div class="goal-bar"><span style="width:${width}%"></span></div>`;
  }
  const dates = [g.milestone_date, g.due_date].filter(Boolean).sort();
  if (dates.length) {
    const days = daysUntil(dates[0]);
    if (days >= 0 && days <= 3) {
      const label = days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days} days remaining`;
      return `<div class="goal-chip-row"><span class="chip rel-rose">${label}</span></div>`;
    }
    if (g.milestone_date) {
      return `<div class="goal-chip-row"><span class="chip rel-grey">Next milestone · ${fmtDate(g.milestone_date)}</span></div>`;
    }
    return `<div class="goal-chip-row"><span class="chip rel-grey">Due ${fmtDate(g.due_date)}</span></div>`;
  }
  return '';
}

function renderGoals() {
  const goals = (state && state.goals) || [];
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthName = now.toLocaleDateString('en-US', { month: 'short' });
  $('#goalsEyebrow').textContent = `${weekday}, ${monthName} ${now.getDate()}`;
  $('#goalList').innerHTML = goals.length
    ? goals.map((g) => {
        const detail = g.detail
          ? esc(g.detail)
          : g.due_date ? `Due ${fmtDate(g.due_date)}` : '';
        return `
        <article class="card goal-card" data-goal-id="${g.id}">
          ${g.eyebrow ? `<p class="eyebrow">${esc(g.eyebrow)}</p>` : ''}
          <h3 class="goal-title">${esc(g.title)}</h3>
          ${detail ? `<p class="goal-detail">${detail}</p>` : ''}
          ${goalFooterHtml(g)}
        </article>`;
      }).join('')
    : '<p class="muted">No goals yet.</p>';

  document.querySelectorAll('[data-goal-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const g = goals.find((x) => x.id === Number(card.dataset.goalId));
      if (g) openGoalEditor(g);
    });
  });
}

function openGoalEditor(g) {
  $('#goalFormTitle').textContent = g ? 'Edit goal' : 'Add goal';
  $('#goalId').value = g ? g.id : '';
  $('#goalTitle').value = g ? g.title : '';
  $('#goalEyebrow').value = g ? g.eyebrow || '' : '';
  $('#goalDetail').value = g ? g.detail || '' : '';
  $('#goalDue').value = g && g.due_date ? g.due_date : '';
  $('#goalMilestone').value = g && g.milestone_date ? g.milestone_date : '';
  $('#goalCurrent').value = g && g.current !== null && g.current !== undefined ? g.current : '';
  $('#goalTotal').value = g && g.total !== null && g.total !== undefined ? g.total : '';
  $('#goalMonthly').checked = g ? Number(g.is_monthly_target) === 1 : false;
  $('#goalError').textContent = '';
  openModal('goalModal');
}
$('#newGoalBtn').addEventListener('click', () => openGoalEditor(null));

$('#goalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#goalError').textContent = '';
  const id = $('#goalId').value;
  const numOrNull = (v) => (v === '' ? null : Number(v));
  const payload = {
    title: $('#goalTitle').value.trim(),
    eyebrow: $('#goalEyebrow').value,
    detail: $('#goalDetail').value,
    due_date: $('#goalDue').value || null,
    milestone_date: $('#goalMilestone').value || null,
    current: numOrNull($('#goalCurrent').value),
    total: numOrNull($('#goalTotal').value),
    is_monthly_target: $('#goalMonthly').checked ? 1 : 0,
    actor,
  };
  try {
    if (id) await api(`/api/goals/${id}`, { method: 'PATCH', body: payload });
    else await api('/api/goals', { method: 'POST', body: payload });
    closeModal('goalModal');
    await loadState();
  } catch (err) {
    $('#goalError').textContent = err.message;
  }
});

/* ================= follow-ups ================= */

const CHANNEL_LABELS = { email: 'Email', whatsapp: 'WhatsApp', phone: 'Phone', linkedin: 'LinkedIn', other: 'Other' };

function renderFollowups() {
  const people = (state && state.people) || [];
  $('#peopleList').innerHTML = people.length
    ? people.map((p) => `
        <div class="person-row" data-person-id="${p.id}">
          <div class="grow">
            <div class="person-name">${esc(p.name)}</div>
            ${p.context ? `<div class="person-context">${esc(p.context)}</div>` : ''}
            ${p.note ? `<div class="person-note">${esc(p.note)}</div>` : ''}
            ${p.next_step ? `<div class="person-next"><span class="person-next-label">Next step</span> ${esc(p.next_step)}</div>` : ''}
          </div>
          <span class="chip channel-chip">${esc(CHANNEL_LABELS[p.channel] || 'Email')}</span>
        </div>`).join('')
    : '<p class="muted">No one on the list yet.</p>';
  document.querySelectorAll('[data-person-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const p = people.find((x) => x.id === Number(row.dataset.personId));
      if (p) openPersonEditor(p);
    });
  });
}

function openPersonEditor(p) {
  $('#personFormTitle').textContent = p ? 'Edit person' : 'Add person';
  $('#personId').value = p ? p.id : '';
  $('#personName').value = p ? p.name : '';
  $('#personContext').value = p ? p.context || '' : '';
  $('#personNote').value = p ? p.note || '' : '';
  $('#personNextStep').value = p ? p.next_step || '' : '';
  const channel = p && p.channel ? p.channel : 'email';
  $('#personChannel').value = [...$('#personChannel').options].some((o) => o.value === channel) ? channel : 'other';
  $('#personError').textContent = '';
  openModal('personModal');
}
$('#newPersonBtn').addEventListener('click', () => openPersonEditor(null));

$('#personForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#personError').textContent = '';
  const id = $('#personId').value;
  const payload = {
    name: $('#personName').value.trim(),
    context: $('#personContext').value,
    note: $('#personNote').value,
    next_step: $('#personNextStep').value,
    channel: $('#personChannel').value,
    actor,
  };
  try {
    if (id) await api(`/api/people/${id}`, { method: 'PATCH', body: payload });
    else await api('/api/people', { method: 'POST', body: payload });
    closeModal('personModal');
    await loadState();
  } catch (err) {
    $('#personError').textContent = err.message;
  }
});

// Today deadlines-card rows jump to the date in the Deadlines view.
$('#todayDeadlines').addEventListener('click', (e) => {
  const row = e.target.closest('[data-goto-deadline]');
  if (row) gotoDeadlineDate(row.dataset.gotoDeadline);
});

/* ================= calendar ================= */

let calOffset = 0; // months away from the current month
let calSelected = null; // iso of the day whose detail shows under the grid

function renderCalendar() {
  if (!state) return;
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + calOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  $('#calTitle').textContent = base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Selection: keep it while it sits in the shown month; otherwise fall
  // back to today (current month) or the 1st of the shown month, so the
  // detail panel below never goes stale.
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  if (!calSelected || !calSelected.startsWith(monthPrefix)) {
    const nowDate = new Date();
    const isCurrentMonth = year === nowDate.getFullYear() && month === nowDate.getMonth();
    calSelected = isCurrentMonth ? todayStr() : `${monthPrefix}-01`;
  }

  const dlByDate = {};
  (state.deadlines || []).forEach((d) => { (dlByDate[d.date] = dlByDate[d.date] || []).push(d); });
  const taskByDate = {};
  (state.tasks || [])
    .filter((x) => x.due && x.status !== 'done')
    .forEach((x) => { (taskByDate[x.due] = taskByDate[x.due] || []).push(x); });
  const evByDate = {};
  (state.events || []).forEach((e) => { (evByDate[e.date] = evByDate[e.date] || []).push(e); });

  const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoOf(d);
    const inMonth = d.getMonth() === month;
    const dls = dlByDate[iso] || [];
    const tks = taskByDate[iso] || [];
    const evs = evByDate[iso] || [];
    const chips = dls.slice(0, 2)
      .map((x) => `<span class="cal-chip">${esc(x.title)}</span>`).join('') +
      (dls.length > 2 ? `<span class="cal-more">+${dls.length - 2} more</span>` : '');
    // Events share the dots marker with open tasks: a day marker only —
    // the detail panel below is where events actually render.
    const dotCount = tks.length + evs.length;
    const dots = dotCount
      ? `<span class="cal-dots">${'<i></i>'.repeat(Math.min(3, dotCount))}</span>`
      : '';
    const label = `${fmtDate(iso)}${evs.length ? ` — ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}${dls.length ? ` — ${dls.length} deadline${dls.length > 1 ? 's' : ''}` : ''}${tks.length ? ` — ${tks.length} open task${tks.length > 1 ? 's' : ''} due` : ''}`;
    html += `<div class="cal-cell${inMonth ? '' : ' out'}${iso === todayStr() ? ' is-today' : ''}${dls.length ? ' has-deadline' : ''}${iso === calSelected ? ' selected' : ''}" data-cal-date="${iso}" role="button" tabindex="0" aria-label="${esc(label)}" title="${esc(label)}">
      <div class="cal-cell-top"><span class="cal-num">${d.getDate()}</span>${dots}</div>
      ${chips ? `<div class="cal-chips">${chips}</div>` : ''}
    </div>`;
  }
  $('#calGrid').innerHTML = html;
  renderCalDayDetail();
}

// Rows for one day's detail panel — events first (the day's fixed
// appointments), then deadlines, then open tasks due that day. Shared
// by the Calendar view and Today's week strip. Event rows are display
// only: no editor, no click target. Task rows carry [data-open-task],
// so the shared editor handler opens them in place.
function dayItemsHtml(iso) {
  const evs = (state.events || []).filter((e) => e.date === iso);
  const dls = (state.deadlines || []).filter((d) => d.date === iso);
  const tks = (state.tasks || []).filter((t) => t.due === iso && t.status !== 'done');
  const rows = [
    ...evs.map((e) => `
      <div class="cal-day-row event">
        <div class="grow">
          <div class="cal-day-name">${esc(e.title)}</div>
          ${e.notes ? `<div class="cal-day-notes">${esc(e.notes)}</div>` : ''}
        </div>
        ${e.time ? `<span class="chip event-time">${esc(e.time)}</span>` : ''}<span class="chip sched-chip">Schedule</span>
      </div>`),
    ...dls.map((d) => `
      <div class="cal-day-row">
        <div class="grow">
          <div class="cal-day-name">${esc(d.title)}</div>
          ${d.notes ? `<div class="cal-day-notes">${esc(d.notes)}</div>` : ''}
        </div>
        ${ownerChip(d.owner)}${relChip(d)}
      </div>`),
    ...tks.map((t) => `
      <div class="cal-day-row task" data-open-task="${t.id}" role="button" tabindex="0">
        <div class="grow"><div class="cal-day-name">${esc(t.title)}</div></div>
        ${ownerChip(t.owner)}${dueChip(t)}
      </div>`),
  ];
  return rows.length ? rows.join('') : '<p class="muted">Nothing on this day.</p>';
}

// The selected day's events, deadlines and open tasks, rendered in
// place under the grid. Task rows reuse the shared [data-open-task]
// editor handler; event rows are display only.
function renderCalDayDetail() {
  const iso = calSelected || todayStr();
  $('#calDayTitle').textContent = parseDay(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  $('#calDayItems').innerHTML = dayItemsHtml(iso);
}

function selectCalDay(iso) {
  calSelected = iso;
  document.querySelectorAll('#calGrid .cal-cell').forEach((c) => {
    c.classList.toggle('selected', c.dataset.calDate === iso);
  });
  renderCalDayDetail();
}

$('#calGrid').addEventListener('click', (e) => {
  const cell = e.target.closest('[data-cal-date]');
  if (cell) selectCalDay(cell.dataset.calDate);
});
$('#calGrid').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const cell = e.target.closest('[data-cal-date]');
  if (cell) { e.preventDefault(); selectCalDay(cell.dataset.calDate); }
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
  renderMonthlyTarget();
  renderGoals();
  renderBoard();
  renderCalendar();
  renderDeadlines();
  renderReports();
  renderFollowups();
  refreshReportForm();
}

/* Sign-in is currently off by choice: the app shell is the default
   landing page and /api/state answers openly. The gate may only appear
   on a genuine 401 from the API (which api() handles itself) — never
   because a state load hiccuped or a render threw. On load failure we
   retry once, then show the shell with an inline error note. */

function setLoadError(show) {
  $('#loadError').classList.toggle('hidden', !show);
}

async function loadStateRetry() {
  try {
    await loadState();
    setLoadError(false);
    return;
  } catch (err) {
    if (err && err.message === 'Not signed in.') return; // genuine 401: gate already shown by api()
  }
  await new Promise((r) => setTimeout(r, 900));
  try {
    await loadState();
    setLoadError(false);
  } catch (err) {
    if (err && err.message === 'Not signed in.') return;
    setLoadError(true);
  }
}
$('#loadRetryBtn').addEventListener('click', loadStateRetry);

(function init() {
  const sel = $('#actorSelect');
  sel.value = actor;
  if (sel.value !== actor) { actor = 'Jesutofunmi'; sel.value = actor; }
  syncActorCard();
  $('#reportDate').value = todayStr();
  $('#reportAuthor').value = actor;
  showApp();
  loadStateRetry();
})();
