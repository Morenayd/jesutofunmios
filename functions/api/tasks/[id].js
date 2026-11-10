// PATCH /api/tasks/:id — partial update.
// Body may include any of: title, details, owner, status, due, evidence, actor.
// Writes an activity row: 'status_changed' when the status moved, else 'updated'.
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
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid task id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  if (!existing) return err('Task not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const next = { ...existing };
  const changed = [];

  if ('title' in body) {
    const title = cleanStr(body.title, 300).trim();
    if (!title) return err('title cannot be empty.', 400);
    if (title !== next.title) { next.title = title; changed.push('title'); }
  }
  if ('details' in body) {
    const details = cleanStr(body.details);
    if (details !== next.details) { next.details = details; changed.push('details'); }
  }
  if ('owner' in body) {
    const owner = validOwner(body.owner);
    if (owner === undefined) return err('owner is not a recognised name.', 400);
    if (owner !== next.owner) { next.owner = owner; changed.push(`owner → ${owner}`); }
  }
  if ('status' in body) {
    const status = validStatus(body.status);
    if (status === undefined) return err('status must be one of: todo, doing, waiting, done.', 400);
    if (status !== next.status) { next.status = status; changed.push(`status ${existing.status} → ${status}`); }
  }
  if ('due' in body) {
    const due = validDate(body.due);
    if (due === undefined) return err('due must be an ISO date (YYYY-MM-DD) or null.', 400);
    if (due !== next.due) { next.due = due; changed.push('due'); }
  }
  if ('evidence' in body) {
    const evidence = cleanStr(body.evidence, 2000);
    if (evidence !== next.evidence) { next.evidence = evidence; changed.push('evidence'); }
  }

  const actor = getActor(request, body);
  next.updated_by = actor;
  next.updated_at = nowISO();

  await env.DB.prepare(
    `UPDATE tasks SET title = ?, details = ?, owner = ?, status = ?, due = ?, evidence = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(next.title, next.details, next.owner, next.status, next.due, next.evidence, next.updated_by, next.updated_at, id)
    .run();

  const statusChanged = next.status !== existing.status;
  await writeActivity(env, {
    taskId: id,
    actor,
    action: statusChanged ? 'status_changed' : 'updated',
    note: changed.length ? `${next.title} — ${changed.join('; ')}` : next.title,
  });

  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ task });
}
