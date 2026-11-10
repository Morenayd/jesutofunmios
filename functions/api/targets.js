// POST /api/targets — kept for API compatibility. The monthly target
// now lives in the goals table as the flagged goal; this writes through
// to that goal (creating it, flagged, when none exists) and answers in
// the target shape.
// Body: { label (required), detail, current, total, due_date, actor }
import {
  cleanStr,
  ensureGoalsTable,
  err,
  flaggedGoal,
  getActor,
  goalAsTarget,
  json,
  nowISO,
  parseBody,
  validCount,
  validDate,
  writeActivity,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  await ensureGoalsTable(env);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const label = cleanStr(body.label, 200).trim();
  if (!label) return err('label is required.', 400);

  const current = validCount(body.current, 0);
  if (current === undefined) return err('current must be a whole number, 0 or more.', 400);
  const total = validCount(body.total, 0);
  if (total === undefined) return err('total must be a whole number, 0 or more.', 400);

  const dueDate = validDate(body.due_date);
  if (dueDate === undefined) return err('due_date must be an ISO date (YYYY-MM-DD).', 400);

  const actor = getActor(request, body);
  const ts = nowISO();
  const detail = cleanStr(body.detail, 500);

  const existing = await flaggedGoal(env);
  let goal;
  if (existing) {
    await env.DB.prepare(
      'UPDATE goals SET title = ?, detail = ?, current = ?, total = ?, due_date = ?, updated_at = ? WHERE id = ?'
    )
      .bind(label, detail, current, total, dueDate, ts, existing.id)
      .run();
    goal = await env.DB.prepare('SELECT * FROM goals WHERE id = ?').bind(existing.id).first();
  } else {
    const result = await env.DB.prepare(
      'INSERT INTO goals (title, eyebrow, detail, due_date, milestone_date, current, total, is_monthly_target, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(label, '', detail, dueDate, null, current, total, 1, actor, ts, ts)
      .run();
    goal = await env.DB.prepare('SELECT * FROM goals WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();
  }

  await writeActivity(env, { actor, action: 'target_added', note: label });

  return json({ target: goalAsTarget(goal) }, 201);
}
