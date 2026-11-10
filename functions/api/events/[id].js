// PATCH /api/events/:id — partial update of date, title, time and notes.
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
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  await ensureEventsTable(env);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid event id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  if (!existing) return err('Event not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const next = { ...existing };

  if ('date' in body) {
    const date = validDate(body.date);
    if (date === undefined || date === null) return err('date must be an ISO date (YYYY-MM-DD).', 400);
    next.date = date;
  }
  if ('title' in body) {
    const title = cleanStr(body.title, 300).trim();
    if (!title) return err('title cannot be empty.', 400);
    next.title = title;
  }
  if ('time' in body) next.time = cleanStr(body.time, 100);
  if ('notes' in body) next.notes = cleanStr(body.notes, 2000);

  await env.DB.prepare(
    'UPDATE events SET date = ?, title = ?, time = ?, notes = ?, updated_at = ? WHERE id = ?'
  )
    .bind(next.date, next.title, next.time, next.notes, nowISO(), id)
    .run();

  const actor = getActor(request, body);
  await writeActivity(env, { actor, action: 'event_updated', note: `${next.title} (${next.date})` });

  const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  return json({ event });
}
