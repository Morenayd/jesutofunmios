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

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER,                             -- NULL for digest/deadline events
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,                       -- created | status_changed | updated | digest_posted | deadline_added | deadline_updated
  note       TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);
CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(date);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_date_author ON reports(date, author);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);
