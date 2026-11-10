// PATCH /api/projects/:id — partial update of name, description, status.
import {
  cleanStr,
  ensureProjectsTable,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  validProjectStatus,
  writeActivity,
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  await ensureProjectsTable(env);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid project id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!existing) return err('Project not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const next = { ...existing };

  if ('name' in body) {
    const name = cleanStr(body.name, 200).trim();
    if (!name) return err('name cannot be empty.', 400);
    next.name = name;
  }
  if ('description' in body) next.description = cleanStr(body.description, 2000);
  if ('status' in body) {
    const status = validProjectStatus(body.status, 'active');
    if (status === undefined) return err('status must be one of: active, paused, done.', 400);
    next.status = status;
  }

  await env.DB.prepare(
    'UPDATE projects SET name = ?, description = ?, status = ?, updated_at = ? WHERE id = ?'
  )
    .bind(next.name, next.description, next.status, nowISO(), id)
    .run();

  const actor = getActor(request, body);
  await writeActivity(env, { actor, action: 'project_updated', note: next.name });

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  return json({ project });
}
