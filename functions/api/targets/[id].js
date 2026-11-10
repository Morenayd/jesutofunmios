// PATCH /api/targets/:id — kept for API compatibility. The id is a
// goal's id (the only id state.targets ever exposes is the flagged
// goal's); the update writes through to that goal. Addressing a goal
// as the target makes it the monthly target.
import {
  cleanStr,
  ensureGoalsTable,
  err,
  getActor,
  goalAsTarget,
  json,
  nowISO,
  parseBody,
  validCount,
  validDate,
  writeActivity,
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  await ensureGoalsTable(env);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid target id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM goals WHERE id = ?').bind(id).first();
  if (!existing) return err('Target not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const next = { ...existing };

  if ('label' in body) {
    const label = cleanStr(body.label, 200).trim();
    if (!label) return err('label cannot be empty.', 400);
    next.title = label;
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
    'UPDATE goals SET title = ?, detail = ?, current = ?, total = ?, due_date = ?, is_monthly_target = 1, updated_at = ? WHERE id = ?'
  )
    .bind(next.title, next.detail, next.current, next.total, next.due_date, nowISO(), id)
    .run();
  // Exactly one monthly target.
  await env.DB.prepare('UPDATE goals SET is_monthly_target = 0 WHERE id != ?').bind(id).run();

  const actor = getActor(request, body);
  await writeActivity(env, { actor, action: 'target_updated', note: next.title });

  const goal = await env.DB.prepare('SELECT * FROM goals WHERE id = ?').bind(id).first();
  return json({ target: goalAsTarget(goal) });
}
