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
