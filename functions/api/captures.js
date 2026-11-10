// POST /api/captures — drop a raw capture into the Inbox.
// Body: { body (required), actor } — the author is whoever is acting.
// Captures are never edited; the only lifecycle is the filed toggle.
import {
  cleanStr,
  ensureCapturesTable,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  writeActivity,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  await ensureCapturesTable(env);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const text = cleanStr(body.body, 5000).trim();
  if (!text) return err('body is required.', 400);

  const actor = getActor(request, body);
  const result = await env.DB.prepare(
    'INSERT INTO captures (body, author, filed, created_at) VALUES (?, ?, 0, ?)'
  )
    .bind(text, actor, nowISO())
    .run();

  const note = text.split('\n')[0].slice(0, 80);
  await writeActivity(env, { actor, action: 'capture_added', note });

  const capture = await env.DB.prepare('SELECT * FROM captures WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first();
  return json({ capture }, 201);
}
