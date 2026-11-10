# Life HQ

A personal project-management platform for **Jesutofunmi Adewole**, shared by her and her AI assistants — **Nayden** (who runs the board), **Claude**, **ChatGPT** and **Instinct**. Think of it as a project manager with several employees: everyone works from the same board, claims tasks before starting them, and closes them only with evidence.

It is a Cloudflare Pages app: a static single-page front-end plus Pages Functions backed by a D1 (SQLite) database. No build step and no external CDNs — the front-end is hand-rolled HTML/CSS/JS in `public/`.

## Layout

```
public/                 Static SPA (index.html, styles.css, app.js)
functions/api/          Pages Functions (the JSON API)
  _middleware.js        Auth gate for all /api/* routes except /api/auth
  _shared.js            Validation lists, session token, activity writer
  auth.js               POST /api/auth
  logout.js             POST /api/logout
  state.js              GET  /api/state
  tasks.js              POST /api/tasks
  tasks/[id].js         PATCH /api/tasks/:id
  digests.js            POST /api/digests
  digests/[id].js       GET  /api/digests/:id
  deadlines.js          POST /api/deadlines
  deadlines/[id].js     PATCH /api/deadlines/:id
schema.sql              D1 schema (tasks, digests, deadlines, activity)
seed.json               Seed data (15 tasks, 7 deadlines, 1 digest)
seed.sql                The same seed data as SQL inserts (generated from seed.json)
wrangler.toml           Pages config; binds the D1 database as DB
```

## Data model

- **tasks** — title, details, owner (`Jesutofunmi | Nayden | Claude | ChatGPT | Instinct | Unassigned`), status (`todo | doing | waiting | done`), due (ISO date or null), created_by, updated_by, evidence (completion note / link), timestamps.
- **digests** — date, title, body (markdown), created_by. Nayden posts one each morning.
- **deadlines** — title, date, notes, owner.
- **activity** — append-only log. Every task create/update/status change writes a row (digest and deadline events too, with a null task_id). Rows record the actor, so the board shows who did what.

## How the passcode gate works

There is exactly one credential: a shared **team passcode**, stored only as the Pages secret `TEAM_PASSCODE`. There is no per-user account system — the passcode gets you in, and the **“Acting as”** selector in the top bar says who you are; it is sent with every write and recorded in `created_by` / `updated_by` / the activity log.

1. The browser posts the passcode to `POST /api/auth`.
2. The function digests it with SHA-256 and compares it to the digest of `TEAM_PASSCODE`. On a match it sets an `HttpOnly; Secure; SameSite=Lax` cookie (`lhq_session`) whose value is that digest — the passcode itself is never stored in the browser or echoed back.
3. `_middleware.js` checks the cookie against the derived token on every other `/api/*` request and returns 401 otherwise.
4. Sign out calls `POST /api/logout`, which clears the cookie.

Honest limits: this is a shared-passcode gate for a small trusted team, not individual authentication. Anyone with the passcode can act under any name in “Acting as” — the activity log is an honour-system audit trail, which is the right weight for this tool. Rotate the passcode (change the secret, redeploy) if it leaks; all sessions invalidate at once because the token is derived from it. Automation (e.g. Nayden's scheduled jobs) authenticates the same way: `POST /api/auth` with the passcode, then send the returned cookie.

## API

All routes are JSON and (except `/api/auth`) require the session cookie. Writes take the actor from the `X-Actor` header or an `actor` body field.

| Route | What it does |
| --- | --- |
| `POST /api/auth` | `{passcode, actor}` → sets the session cookie |
| `POST /api/logout` | Clears the session cookie |
| `GET /api/state` | Open tasks + latest 50 done, latest digest in full, digest index (id/date/title), deadlines sorted by date, latest 30 activity rows |
| `POST /api/tasks` | Create a task (title required) |
| `PATCH /api/tasks/:id` | Update title/details/owner/status/due/evidence |
| `POST /api/digests` | Post a digest (title + markdown body required; date optional) |
| `GET /api/digests/:id` | One digest in full (for the archive view) |
| `POST /api/deadlines` | Add a deadline (title + date required) |
| `PATCH /api/deadlines/:id` | Update a deadline |

Owner and status values are validated against the lists above; anything else is rejected with 400. There is deliberately **no delete**: tasks are never deleted, only completed or parked in Waiting with an explanation. Marking a task `done` is allowed by the API without evidence, but the board's own UI refuses it and the agent protocol (below) forbids it — the rule lives where the agents read it.

## Deploying (wrangler)

Prerequisites: a Cloudflare account and wrangler (`npm install -g wrangler`, or use `npx wrangler`). Then, from this directory:

```bash
# 1. Create the database, then paste its id into wrangler.toml (database_id)
wrangler d1 create life-hq

# 2. Create the tables and load the seed data
wrangler d1 execute life-hq --remote --file=schema.sql
wrangler d1 execute life-hq --remote --file=seed.sql

# 3. Set the team passcode as a secret (you will be prompted to type it)
wrangler pages secret put TEAM_PASSCODE --project-name life-hq

# 4. Deploy (wrangler.toml supplies the output dir "public" and the D1 binding;
#    the functions/ directory is picked up automatically)
wrangler pages deploy
```

Alternatively create the Pages project in the Cloudflare dashboard connected to a git repo containing this folder, set the same D1 binding (`DB`) and the `TEAM_PASSCODE` secret in the project settings, and run the two `wrangler d1 execute` commands from anywhere.

Local development:

```bash
echo 'TEAM_PASSCODE=choose-a-local-passcode' > .dev.vars   # gitignored
wrangler pages dev
# in a second shell, once, for the local database:
wrangler d1 execute life-hq --local --file=schema.sql
wrangler d1 execute life-hq --local --file=seed.sql
```

## Agent protocol (summary)

The full protocol lives on the platform's **Agents** page, written for an assistant opening the site cold. The short version:

- Sign in with the team passcode from Jesutofunmi; set “Acting as” to your own name before writing anything.
- **Claim before you start**: set yourself as owner and move the task to In Progress.
- **Complete with evidence**: a link, confirmation wording, or reference in the evidence field. Never mark Done without it.
- **Blocked?** Move it to Waiting on Jesutofunmi and write exactly what you need in the details.
- **New work** goes in as a new task owned by Unassigned, with your name recorded as creator.
- **Never delete tasks.** Tasks owned by Jesutofunmi, and anything that is an assessment, interview or coursework, are hers to do — assistants only prepare and remind.
