-- Life HQ — D1 schema
-- Apply with: wrangler d1 execute life-hq --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  details    TEXT DEFAULT '',
  owner      TEXT NOT NULL DEFAULT 'Unassigned',  -- Jesutofunmi | Nayden | Claude | ChatGPT | Instinct | Unassigned
  status     TEXT NOT NULL DEFAULT 'todo',        -- todo | doing | waiting | done
  due        TEXT,                                -- ISO date YYYY-MM-DD or NULL
  created_by TEXT DEFAULT '',
  updated_by TEXT DEFAULT '',
  evidence   TEXT DEFAULT '',                     -- completion note / evidence link
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS digests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,                       -- ISO date YYYY-MM-DD
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',            -- markdown
  created_by TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deadlines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  date       TEXT NOT NULL,                       -- ISO date YYYY-MM-DD
  notes      TEXT DEFAULT '',
  owner      TEXT DEFAULT 'Jesutofunmi',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,                       -- ISO date YYYY-MM-DD
  author     TEXT NOT NULL,                       -- Jesutofunmi | Nayden | Claude | ChatGPT | Instinct
  body       TEXT NOT NULL DEFAULT '',            -- markdown
  created_by TEXT DEFAULT '',                     -- who posted it (may differ from author, e.g. Instinct posts for Jesutofunmi)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',     -- active | paused | done
  created_by  TEXT DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS targets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL,                       -- e.g. "Publish 4 hardware essays"
  detail     TEXT NOT NULL DEFAULT '',            -- e.g. "The Hardware Brief"
  current    INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  due_date   TEXT,                                -- ISO date YYYY-MM-DD or NULL
  created_by TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS captures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  body       TEXT NOT NULL DEFAULT '',            -- the raw note, exactly as dropped
  author     TEXT NOT NULL DEFAULT '',            -- who dropped it (the acting-as name)
  filed      INTEGER NOT NULL DEFAULT 0,          -- 1 once Nayden has triaged it
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  context    TEXT NOT NULL DEFAULT '',            -- who they are
  note       TEXT NOT NULL DEFAULT '',            -- why they are on the list
  next_step  TEXT NOT NULL DEFAULT '',            -- the next move
  channel    TEXT NOT NULL DEFAULT 'email',
  created_by TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,                       -- ISO date YYYY-MM-DD
  title      TEXT NOT NULL,                       -- the class or session
  time       TEXT NOT NULL DEFAULT '',            -- free text, e.g. "18:00–20:00 CT"; may be empty
  notes      TEXT NOT NULL DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,                -- the outcome, e.g. "Publish 4 hardware essays"
  eyebrow           TEXT NOT NULL DEFAULT '',     -- e.g. "November · Voice"
  detail            TEXT NOT NULL DEFAULT '',     -- e.g. "The Hardware Brief"
  due_date          TEXT,                         -- ISO date YYYY-MM-DD or NULL
  milestone_date    TEXT,                         -- next milestone, ISO date or NULL
  current           INTEGER,                      -- progress so far; NULL when the goal has no count
  total             INTEGER,                      -- progress denominator; NULL likewise
  is_monthly_target INTEGER NOT NULL DEFAULT 0,   -- exactly one goal holds 1: the Today banner's goal
  created_by        TEXT DEFAULT '',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER,                             -- NULL for digest/deadline events
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,                       -- created | status_changed | updated | deleted | digest_posted | deadline_added | deadline_updated | deadline_deleted | report_posted | project_added | project_updated | target_added | target_updated | capture_added | capture_filed | capture_unfiled | person_added | person_updated | event_added | event_updated | goal_added | goal_updated
  note       TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);
CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(date);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_goals_monthly ON goals(is_monthly_target);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_date_author ON reports(date, author);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);
