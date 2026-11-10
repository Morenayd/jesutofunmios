// PATCH /api/people/:id — partial update of name, context, note,
// next_step and channel.
import {
  cleanStr,
  ensurePeopleTable,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  writeActivity,
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  await ensurePeopleTable(env);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid person id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM people WHERE id = ?').bind(id).first();
  if (!existing) return err('Person not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const next = { ...existing };

  if ('name' in body) {
    const name = cleanStr(body.name, 200).trim();
    if (!name) return err('name cannot be empty.', 400);
    next.name = name;
  }
  if ('context' in body) next.context = cleanStr(body.context, 1000);
  if ('note' in body) next.note = cleanStr(body.note, 2000);
  if ('next_step' in body) next.next_step = cleanStr(body.next_step, 1000);
  if ('channel' in body) {
    next.channel = cleanStr(body.channel, 40).trim().toLowerCase() || 'email';
  }

  await env.DB.prepare(
    'UPDATE people SET name = ?, context = ?, note = ?, next_step = ?, channel = ?, updated_at = ? WHERE id = ?'
  )
    .bind(next.name, next.context, next.note, next.next_step, next.channel, nowISO(), id)
    .run();

  const actor = getActor(request, body);
  await writeActivity(env, { actor, action: 'person_updated', note: next.name });

  const person = await env.DB.prepare('SELECT * FROM people WHERE id = ?').bind(id).first();
  return json({ person });
}
