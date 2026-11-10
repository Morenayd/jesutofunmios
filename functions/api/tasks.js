// POST /api/tasks — create a task.
// Body: { title (required), details, owner, status, due, evidence, actor }
import {
  cleanStr,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  validDate,
  validOwner,
  validStatus,
  writeActivity,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const title = cleanStr(body.title, 300).trim();
  if (!title) return err('title is required.', 400);

  const owner = validOwner(body.owner);
  if (owner === undefined) return err('owner is not a recognised name.', 400);

  const status = validStatus(body.status);
  if (status === undefined) return err('status must be one of: todo, doing, waiting, done.', 400);

  const due = validDate(body.due);
  if (due === undefined) return err('due must be an ISO date (YYYY-MM-DD) or null.', 400);

  const actor = getActor(request, body);
  const ts = nowISO();

  const result = await env.DB.prepare(
    `INSERT INTO tasks (title, details, owner, status, due, created_by, updated_by, evidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      title,
      cleanStr(body.details),
      owner,
      status,
      due,
      actor,
      actor,
      cleanStr(body.evidence, 2000),
      ts,
      ts
    )
    .run();

  const id = result.meta.last_row_id;
  await writeActivity(env, { taskId: id, actor, action: 'created', note: title });

  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ task }, 201);
}
