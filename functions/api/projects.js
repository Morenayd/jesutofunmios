// POST /api/projects — add a project.
// Body: { name (required), description, status (active|paused|done), actor }
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
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  await ensureProjectsTable(env);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const name = cleanStr(body.name, 200).trim();
  if (!name) return err('name is required.', 400);

  const status = validProjectStatus(body.status, 'active');
  if (status === undefined) return err('status must be one of: active, paused, done.', 400);

  const actor = getActor(request, body);
  const ts = nowISO();
  const result = await env.DB.prepare(
    'INSERT INTO projects (name, description, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(name, cleanStr(body.description, 2000), status, actor, ts, ts)
    .run();

  await writeActivity(env, { actor, action: 'project_added', note: name });

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first();
  return json({ project }, 201);
}
