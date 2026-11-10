// POST /api/people — add a person to Follow-ups.
// Body: { name (required), context, note, next_step, channel, actor }
import {
  cleanStr,
  ensurePeopleTable,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  writeActivity,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  await ensurePeopleTable(env);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const name = cleanStr(body.name, 200).trim();
  if (!name) return err('name is required.', 400);

  const channel = cleanStr(body.channel, 40).trim().toLowerCase() || 'email';

  const actor = getActor(request, body);
  const ts = nowISO();
  const result = await env.DB.prepare(
    'INSERT INTO people (name, context, note, next_step, channel, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      name,
      cleanStr(body.context, 1000),
      cleanStr(body.note, 2000),
      cleanStr(body.next_step, 1000),
      channel,
      actor,
      ts,
      ts
    )
    .run();

  await writeActivity(env, { actor, action: 'person_added', note: name });

  const person = await env.DB.prepare('SELECT * FROM people WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first();
  return json({ person }, 201);
}
