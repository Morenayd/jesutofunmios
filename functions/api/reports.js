// POST /api/reports — save a daily report.
// Body: { author (required, one of the five names), body (required, markdown),
//         date (optional, defaults to today), actor }
// One report per (date, author): posting again for the same pair replaces the
// body (upsert). The author is whose report it is; the actor is who posted it
// and lands in created_by — they differ when Instinct posts Jesutofunmi's
// report on her behalf.
import {
  ACTORS,
  cleanStr,
  ensureReportsTable,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  todayISO,
  validAuthor,
  validDate,
  writeActivity,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  await ensureReportsTable(env);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const author = validAuthor(body.author);
  if (author === undefined) {
    return err(`author is required and must be one of: ${ACTORS.join(', ')}.`, 400);
  }

  const text = cleanStr(body.body, 60000);
  if (!text.trim()) return err('body is required.', 400);

  let date = todayISO();
  if (body.date !== undefined && body.date !== null && body.date !== '') {
    date = validDate(body.date);
    if (date === undefined || date === null) return err('date must be an ISO date (YYYY-MM-DD).', 400);
  }

  const actor = getActor(request, body);
  const ts = nowISO();

  const existing = await env.DB.prepare('SELECT id FROM reports WHERE date = ? AND author = ?')
    .bind(date, author)
    .first();

  await env.DB.prepare(
    `INSERT INTO reports (date, author, body, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date, author) DO UPDATE SET
       body = excluded.body,
       created_by = excluded.created_by,
       updated_at = excluded.updated_at`
  )
    .bind(date, author, text, actor, ts, ts)
    .run();

  await writeActivity(env, { actor, action: 'report_posted', note: `Daily report — ${author} (${date})` });

  const report = await env.DB.prepare('SELECT * FROM reports WHERE date = ? AND author = ?')
    .bind(date, author)
    .first();
  return json({ report }, existing ? 200 : 201);
}
