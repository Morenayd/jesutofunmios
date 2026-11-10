// POST /api/digests — publish a digest.
// Body: { title (required), body (required, markdown), date (optional, defaults to today), actor }
import {
  cleanStr,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  todayISO,
  validDate,
  writeActivity,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const title = cleanStr(body.title, 300).trim();
  if (!title) return err('title is required.', 400);

  const text = cleanStr(body.body, 60000);
  if (!text.trim()) return err('body is required.', 400);

  let date = todayISO();
  if (body.date !== undefined && body.date !== null && body.date !== '') {
    date = validDate(body.date);
    if (date === undefined || date === null) return err('date must be an ISO date (YYYY-MM-DD).', 400);
  }

  const actor = getActor(request, body);
  const result = await env.DB.prepare(
    'INSERT INTO digests (date, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(date, title, text, actor, nowISO())
    .run();

  await writeActivity(env, { actor, action: 'digest_posted', note: title });

  const digest = await env.DB.prepare('SELECT * FROM digests WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first();
  return json({ digest }, 201);
}
