// PATCH /api/goals/:id — partial update of title, eyebrow, detail,
// due_date, milestone_date, current, total and is_monthly_target.
// Setting is_monthly_target = 1 unflags every other goal: exactly one
// goal is the monthly target at a time.
import {
  cleanStr,
  ensureGoalsTable,
  err,
  getActor,
  json,
  nowISO,
  parseBody,
  validDate,
  validNullableCount,
  writeActivity,
} from '../_shared.js';

export async function onRequestPatch({ request, env, params }) {
  await ensureGoalsTable(env);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid goal id.', 400);

  const existing = await env.DB.prepare('SELECT * FROM goals WHERE id = ?').bind(id).first();
  if (!existing) return err('Goal not found.', 404);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const next = { ...existing };

  if ('title' in body) {
    const title = cleanStr(body.title, 300).trim();
    if (!title) return err('title cannot be empty.', 400);
    next.title = title;
  }
  if ('eyebrow' in body) next.eyebrow = cleanStr(body.eyebrow, 120);
  if ('detail' in body) next.detail = cleanStr(body.detail, 500);
  if ('due_date' in body) {
    const dueDate = validDate(body.due_date);
    if (dueDate === undefined) return err('due_date must be an ISO date (YYYY-MM-DD).', 400);
    next.due_date = dueDate;
  }
  if ('milestone_date' in body) {
    const milestoneDate = validDate(body.milestone_date);
    if (milestoneDate === undefined) return err('milestone_date must be an ISO date (YYYY-MM-DD).', 400);
    next.milestone_date = milestoneDate;
  }
  if ('current' in body) {
    const current = validNullableCount(body.current);
    if (current === undefined) return err('current must be a whole number, 0 or more.', 400);
    next.current = current;
  }
  if ('total' in body) {
    const total = validNullableCount(body.total);
    if (total === undefined) return err('total must be a whole number, 0 or more.', 400);
    next.total = total;
  }
  if ('is_monthly_target' in body) next.is_monthly_target = body.is_monthly_target ? 1 : 0;

  await env.DB.prepare(
    'UPDATE goals SET title = ?, eyebrow = ?, detail = ?, due_date = ?, milestone_date = ?, current = ?, total = ?, is_monthly_target = ?, updated_at = ? WHERE id = ?'
  )
    .bind(
      next.title, next.eyebrow, next.detail, next.due_date, next.milestone_date,
      next.current, next.total, next.is_monthly_target, nowISO(), id
    )
    .run();

  if (Number(next.is_monthly_target) === 1) {
    // Exactly one monthly target: flagging this goal unflags the rest.
    await env.DB.prepare('UPDATE goals SET is_monthly_target = 0 WHERE id != ?').bind(id).run();
  }

  const actor = getActor(request, body);
  await writeActivity(env, { actor, action: 'goal_updated', note: next.title });

  const goal = await env.DB.prepare('SELECT * FROM goals WHERE id = ?').bind(id).first();
  return json({ goal });
}
