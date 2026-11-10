// PATCH /api/deadlines/:id — partial update of title, date, notes, owner.
import {
  cleanStr,
  err,
  getActor,
  json,
  parseBody,
  validDate,
  validOwner,
  writeActivity,
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid deadline id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM deadlines WHERE id = ?').bind(id).first();
  if (!existing) return err('Deadline not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const next = { ...existing };

  if ('title' in body) {
    const title = cleanStr(body.title, 300).trim();
    if (!title) return err('title cannot be empty.', 400);
    next.title = title;
  }
  if ('date' in body) {
    const date = validDate(body.date);
    if (date === undefined || date === null) return err('date must be an ISO date (YYYY-MM-DD).', 400);
    next.date = date;
  }
  if ('notes' in body) next.notes = cleanStr(body.notes, 2000);
  if ('owner' in body) {
    const owner = validOwner(body.owner, 'Jesutofunmi');
    if (owner === undefined) return err('owner is not a recognised name.', 400);
    next.owner = owner;
  }

  await env.DB.prepare('UPDATE deadlines SET title = ?, date = ?, notes = ?, owner = ? WHERE id = ?')
    .bind(next.title, next.date, next.notes, next.owner, id)
    .run();

  const actor = getActor(request, body);
  await writeActivity(env, { actor, action: 'deadline_updated', note: `${next.title} (${next.date})` });

  const deadline = await env.DB.prepare('SELECT * FROM deadlines WHERE id = ?').bind(id).first();
  return json({ deadline });
}
