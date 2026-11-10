// POST /api/deadlines — add a deadline.
// Body: { title (required), date (required), notes, owner, actor }
import {
  cleanStr,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  validDate,
  validOwner,
  writeActivity,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const title = cleanStr(body.title, 300).trim();
  if (!title) return err('title is required.', 400);

  const date = validDate(body.date);
  if (date === undefined || date === null) return err('date must be an ISO date (YYYY-MM-DD).', 400);

  const owner = validOwner(body.owner, 'Jesutofunmi');
  if (owner === undefined) return err('owner is not a recognised name.', 400);

  const actor = getActor(request, body);
  const result = await env.DB.prepare(
    'INSERT INTO deadlines (title, date, notes, owner, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(title, date, cleanStr(body.notes, 2000), owner, nowISO())
    .run();

  await writeActivity(env, { actor, action: 'deadline_added', note: `${title} (${date})` });

  const deadline = await env.DB.prepare('SELECT * FROM deadlines WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first();
  return json({ deadline }, 201);
}
