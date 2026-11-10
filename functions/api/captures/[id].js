// PATCH /api/captures/:id — the filed toggle. Filed means Nayden has
// triaged the capture into the board/digest; unfiling puts it back.
import {
  ensureCapturesTable,
  err,
  getActor,
  json,
  parseBody,
  writeActivity,
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  await ensureCapturesTable(env);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid capture id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM captures WHERE id = ?').bind(id).first();
  if (!existing) return err('Capture not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);
  if (!('filed' in body)) return err('filed is required.', 400);

  const filed = body.filed ? 1 : 0;
  await env.DB.prepare('UPDATE captures SET filed = ? WHERE id = ?').bind(filed, id).run();

  const actor = getActor(request, body);
  await writeActivity(env, {
    actor,
    action: filed ? 'capture_filed' : 'capture_unfiled',
    note: String(existing.body || '').split('\n')[0].slice(0, 80),
  });

  const capture = await env.DB.prepare('SELECT * FROM captures WHERE id = ?').bind(id).first();
  return json({ capture });
}
