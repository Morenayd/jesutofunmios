// POST /api/events — add an event (a class or session: schedule only,
// never a task, never a deadline).
// Body: { date (required), title (required), time, notes, actor }
import {
  cleanStr,
  ensureEventsTable,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  validDate,
  writeActivity,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  await ensureEventsTable(env);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const date = validDate(body.date);
  if (date === undefined || date === null) return err('date must be an ISO date (YYYY-MM-DD).', 400);

  const title = cleanStr(body.title, 300).trim();
  if (!title) return err('title is required.', 400);

  const actor = getActor(request, body);
  const ts = nowISO();
  const result = await env.DB.prepare(
    'INSERT INTO events (date, title, time, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(date, title, cleanStr(body.time, 100), cleanStr(body.notes, 2000), actor, ts, ts)
    .run();

  await writeActivity(env, { actor, action: 'event_added', note: `${title} (${date})` });

  const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first();
  return json({ event }, 201);
}
