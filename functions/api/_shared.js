// JesutofunmiOS — shared helpers for Pages Functions.
// Files beginning with "_" are not routes; they are importable modules.

export const OWNERS = ['Jesutofunmi', 'Nayden', 'Claude', 'ChatGPT', 'Instinct', 'Unassigned'];
export const ACTORS = ['Jesutofunmi', 'Nayden', 'Claude', 'ChatGPT', 'Instinct'];
export const STATUSES = ['todo', 'doing', 'waiting', 'done'];
export const SESSION_COOKIE = 'lhq_session';

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

export function nowISO() {
  return new Date().toISOString();
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// The session token is derived from the passcode, never the passcode itself.
// Anything that knows TEAM_PASSCODE can recompute it; the cookie only ever
// carries this digest.
export async function sessionToken(passcode) {
  const data = new TextEncoder().encode(`${passcode}::jesutofunmios::session-v1`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function readSessionCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

// Actor attribution: the client sends "Acting as" on every write, either as
// the X-Actor header or an `actor` field in the JSON body.
export function getActor(request, body) {
  const raw = request.headers.get('X-Actor') || (body && body.actor) || '';
  const actor = String(raw).trim().slice(0, 40);
  return ACTORS.includes(actor) ? actor : 'Jesutofunmi';
}

export async function parseBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

export function cleanStr(value, max = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).slice(0, max);
}

export function validDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined; // undefined = invalid
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return undefined;
  return s;
}

export function validOwner(value, fallback = 'Unassigned') {
  if (value === undefined || value === null || value === '') return fallback;
  return OWNERS.includes(value) ? value : undefined; // undefined = invalid
}

export function validStatus(value, fallback = 'todo') {
  if (value === undefined || value === null || value === '') return fallback;
  return STATUSES.includes(value) ? value : undefined; // undefined = invalid
}

// Every mutation writes an activity row. task_id is null for digest/deadline events.
export async function writeActivity(env, { taskId = null, actor, action, note = '' }) {
  await env.DB.prepare(
    'INSERT INTO activity (task_id, actor, action, note, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(taskId, actor, action, cleanStr(note, 1000), nowISO())
    .run();
}

// Daily reports: one report per (date, author). The author is whose report it
// is; created_by is who posted it — Jesutofunmi's report is posted by Instinct,
// so the two routinely differ.
export function validAuthor(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return ACTORS.includes(value) ? value : undefined; // undefined = invalid
}

export const REPORTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

// Self-migration: creates the reports table (and its indexes) when missing.
// Idempotent and cheap, so it runs on the API request path — existing
// databases gain the table with no manual console step.
export async function ensureReportsTable(env) {
  if (!env || !env.DB) return;
  await env.DB.batch([
    env.DB.prepare(REPORTS_TABLE_SQL),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_date_author ON reports(date, author)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date)'),
  ]);
}

// Projects: the standing areas of work (the Substack, graduate school, the
// internship campaign...). A project's status is a simple lifecycle —
// active | paused | done — not a task status. Projects are their own
// section: tasks and deadlines are deliberately NOT filed under them.
export const PROJECT_STATUSES = ['active', 'paused', 'done'];

export function validProjectStatus(value, fallback = 'active') {
  if (value === undefined || value === null || value === '') return fallback;
  return PROJECT_STATUSES.includes(value) ? value : undefined; // undefined = invalid
}

export const PROJECTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',
  created_by  TEXT DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
)`;

// The five standing projects. They are also in seed.json/seed.sql for fresh
// installs; the seed-if-empty below covers databases that already exist
// (production), so they gain the rows on the first request after deploy
// with no manual step.
export const PROJECT_SEED = [
  {
    name: 'The Hardware Brief',
    description: 'Substack essays on companies building intelligent hardware, at the edge and at scale.',
  },
  {
    name: 'Graduate school',
    description: 'M.S. Electrical Engineering at Prairie View A&M and CREDIT Lab research, including the NAACL SRW knowledge-graph paper.',
  },
  {
    name: 'Summer 2027 internship campaign',
    description: 'Internship and new-grad applications across PM, ML/AI, software and hardware roles.',
  },
  {
    name: 'BVCC capstone',
    description: 'SparkCharge investment memo for the BVCC Premium Certificate, due Nov 30, 2026.',
  },
  {
    name: 'JesutofunmiOS',
    description: 'This platform: her life-management board, maintained by Nayden with Claude, ChatGPT and Instinct as contributors.',
  },
];

// Self-migration, same pattern as reports: create the projects table when
// missing, and seed the standing projects when the table is empty. There
// is no delete for projects, so an empty table only ever means "not
// seeded yet" — the seed can never resurrect something she removed.
export async function ensureProjectsTable(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(PROJECTS_TABLE_SQL).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM projects').first();
  if (row && row.n === 0) {
    const ts = nowISO();
    await env.DB.batch(
      PROJECT_SEED.map((p) =>
        env.DB
          .prepare(
            'INSERT INTO projects (name, description, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .bind(p.name, p.description, 'active', 'Nayden', ts, ts)
      )
    );
  }
}

// Whole-number counts (a target's current/total). Returns the fallback for
// empty input, undefined for anything that is not a non-negative integer.
export function validCount(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100000) return undefined;
  return n;
}

// Monthly target: the one headline goal shown as the butter banner on
// Today ("MONTHLY TARGET · NOV 30 / Publish 4 hardware essays / 1 / 4
// published"). Targets are edited from the Projects view; Today only
// displays the earliest-due one.
export const TARGETS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS targets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  current    INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  due_date   TEXT,
  created_by TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

// Her own Daybreak demo target, in her words — seeded once, hers to edit.
export const TARGET_SEED = [
  {
    label: 'Publish 4 hardware essays',
    detail: 'The Hardware Brief',
    current: 1,
    total: 4,
    due_date: '2026-11-30',
  },
];

export async function ensureTargetsTable(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(TARGETS_TABLE_SQL).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM targets').first();
  if (row && row.n === 0) {
    const ts = nowISO();
    await env.DB.batch(
      TARGET_SEED.map((t) =>
        env.DB
          .prepare(
            'INSERT INTO targets (label, detail, current, total, due_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(t.label, t.detail, t.current, t.total, t.due_date, 'Nayden', ts, ts)
      )
    );
  }
}

// Captures: the Inbox — raw notes, links and half-formed thoughts dropped
// by anyone, exactly as written. `filed` flips when Nayden has triaged a
// capture into the board/digest; nothing here is edited or deleted.
export const CAPTURES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS captures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  body       TEXT NOT NULL DEFAULT '',
  author     TEXT NOT NULL DEFAULT '',
  filed      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`;

export async function ensureCapturesTable(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(CAPTURES_TABLE_SQL).run();
}

// People: the Follow-ups section — who Jesutofunmi is keeping in touch
// with, and the next step for each. Seeded from her 9 Nov 2026 shortlist
// (people-shortlist-2026-11-09.md), in that file's own words.
export const PEOPLE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS people (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  context    TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  next_step  TEXT NOT NULL DEFAULT '',
  channel    TEXT NOT NULL DEFAULT 'email',
  created_by TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const PEOPLE_SEED = [
  {
    name: 'Jahleesa Phelps',
    context: 'BVCC Executive Director (jahleesa@bvcc.vc); leads the VC cohort programme Jesutofunmi is in and is the point of contact for her Advanced Programs application',
    note: 'Her 3 Nov email asked Jesutofunmi to reply confirming receipt — the reply was drafted but never sent. The same email promised a first-round interview update by Mon 9 Nov; it has not arrived.',
    next_step: 'Confirm receipt and politely follow up on the first-round interview timeline.',
    channel: 'email',
  },
  {
    name: 'Jean Bray',
    context: 'Burns & McDonnell recruiting (jbray@burnsmcd.com); the recruiting contact for the opportunity she picked up at WE26',
    note: 'Interview invitation arrived 8 Nov: a pre-recorded video interview due within one week (~15 Nov, 23:23 ET), plus her unofficial transcript is to be emailed to recruiting — that email is drafted and still unsent.',
    next_step: 'Email the transcript to recruiting; the video interview itself is hers to complete this week.',
    channel: 'email',
  },
  {
    name: 'Dr Xishuang Dong',
    context: 'Her PVAMU professor; agreed to write her Second Start scholarship recommendation letter, and named as her advisor on the POPL 2027 form',
    note: 'The letter was confirmed still outstanding on 10 Oct and the Second Start application stays blocked on it. She named him as advisor on the POPL form on 2 Nov — a natural moment to thank him and nudge the letter.',
    next_step: 'Thank him for the POPL advisor naming and nudge the Second Start letter.',
    channel: 'email',
  },
  {
    name: 'Francesca Falliti',
    context: 'HPE Senior Recruiter on her Product Management Intern process; sent prep tips before the 27 Oct interview',
    note: 'Her 28 Oct acknowledgement said an update would come by email once there was one. None has arrived in the ~2 weeks since the interview — a short, confident status check is timely.',
    next_step: 'Send a short, confident status check on the PM Intern process.',
    channel: 'email',
  },
  {
    name: 'Wendy Lewis',
    context: 'HPE (Cybersecurity & Digital Risk Management); referred her to the HPE PM Intern role in September and sent well-wishes the night before the interview',
    note: 'Jesutofunmi thanked her on 27 Oct and promised "I will keep you posted as things progress." Keeping that promise keeps her strongest internal advocate warm.',
    next_step: 'Send the promised brief update: interview done, awaiting the team\u2019s decision.',
    channel: 'email',
  },
  {
    name: 'John Salihu',
    context: 'Cummins referrer; referred her to the Cummins Electronic Systems Summer Internship (job 2437302) and forwarded her resume himself on 24 Oct',
    note: 'Cummins HR confirmed receipt of her application the same evening, 24 Oct. No thank-you from her appears in sent mail — one is owed to the person who personally carried her resume in.',
    next_step: 'Send a thank-you plus a short status note.',
    channel: 'email',
  },
  {
    name: 'Prof. Olga Mironenko',
    context: 'UIUC ECE professor; invited her to the UIUC ECE prospective graduate students dinner at WE26 and confirmed her spot',
    note: 'She attended the dinner on 6 Nov; Olga\u2019s last message was pre-dinner logistics. A post-dinner thank-you is owed, and UIUC ECE is a live graduate-school connection worth keeping warm.',
    next_step: 'Send a post-dinner thank-you.',
    channel: 'email',
  },
  {
    name: 'Shreyas Doshi',
    context: 'High Leverage Labs — the PM she worked directly with (2025\u20132026); together they took Product Sense and Product Leaders Club from 5% to 38% WAU',
    note: 'Her closest professional tie and strongest PM reference point. No personal exchange appears in the last 30 days of mail (only his newsletter), and she is mid PM-interview season.',
    next_step: 'Send a short update to keep the relationship current.',
    channel: 'email',
  },
  {
    name: 'Lijun Qian',
    context: 'Research co-author of the review paper on foundation models for knowledge graphs (HGNet, ULTRA, MERRY)',
    note: 'A live research collaboration with no recorded contact since she built the presentation from their paper on 7 Oct. Relationship maintenance — lowest urgency on the shortlist.',
    next_step: 'Send a brief check-in on the collaboration.',
    channel: 'email',
  },
];

export async function ensurePeopleTable(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(PEOPLE_TABLE_SQL).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM people').first();
  if (row && row.n === 0) {
    const ts = nowISO();
    await env.DB.batch(
      PEOPLE_SEED.map((p) =>
        env.DB
          .prepare(
            'INSERT INTO people (name, context, note, next_step, channel, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(p.name, p.context, p.note, p.next_step, p.channel, 'Nayden', ts, ts)
      )
    );
  }
}
