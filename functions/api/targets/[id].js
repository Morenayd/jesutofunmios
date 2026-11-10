// PATCH /api/targets/:id — partial update of label, detail, current,
// total and due_date.
import {
  cleanStr,
  ensureTargetsTable,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  validCount,
  validDate,
  writeActivity,
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  await ensureTargetsTable(env);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid target id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM targets WHERE id = ?').bind(id).first();
  if (!existing) return err('Target not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const next = { ...existing };

  if ('label' in body) {
    const label = cleanStr(body.label, 200).trim();
    if (!label) return err('label cannot be empty.', 400);
    next.label = label;
  }
  if ('detail' in body) next.detail = cleanStr(body.detail, 500);
  if ('current' in body) {
    const current = validCount(body.current, 0);
    if (current === undefined) return err('current must be a whole number, 0 or more.', 400);
    next.current = current;
  }
  if ('total' in body) {
    const total = validCount(body.total, 0);
    if (total === undefined) return err('total must be a whole number, 0 or more.', 400);
    next.total = total;
  }
  if ('due_date' in body) {
    const dueDate = validDate(body.due_date);
    if (dueDate === undefined) return err('due_date must be an ISO date (YYYY-MM-DD).', 400);
    next.due_date = dueDate;
  }

  await env.DB.prepare(
    'UPDATE targets SET label = ?, detail = ?, current = ?, total = ?, due_date = ?, updated_at = ? WHERE id = ?'
  )
    .bind(next.label, next.detail, next.current, next.total, next.due_date, nowISO(), id)
    .run();

  const actor = getActor(request, body);
  await writeActivity(env, { actor, action: 'target_updated', note: next.label });

  const target = await env.DB.prepare('SELECT * FROM targets WHERE id = ?').bind(id).first();
  return json({ target });
}
