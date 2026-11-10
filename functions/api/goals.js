// POST /api/goals — add a goal.
// Body: { title (required), eyebrow, detail, due_date, milestone_date,
//         current, total, is_monthly_target, actor }
// Progress figures are optional: current/total stay null when not given.
// Flagging the new goal as the monthly target unflags every other goal.
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
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  await ensureGoalsTable(env);

  const body = await parseBody(request);
  if (!body) return err('Body must be valid JSON.', 400);

  const title = cleanStr(body.title, 300).trim();
  if (!title) return err('title is required.', 400);

  const dueDate = validDate(body.due_date);
  if (dueDate === undefined) return err('due_date must be an ISO date (YYYY-MM-DD).', 400);
  const milestoneDate = validDate(body.milestone_date);
  if (milestoneDate === undefined) return err('milestone_date must be an ISO date (YYYY-MM-DD).', 400);

  const current = validNullableCount(body.current);
  if (current === undefined) return err('current must be a whole number, 0 or more.', 400);
  const total = validNullableCount(body.total);
  if (total === undefined) return err('total must be a whole number, 0 or more.', 400);

  const isMonthly = body.is_monthly_target ? 1 : 0;

  const actor = getActor(request, body);
  const ts = nowISO();
  const result = await env.DB.prepare(
    'INSERT INTO goals (title, eyebrow, detail, due_date, milestone_date, current, total, is_monthly_target, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      title, cleanStr(body.eyebrow, 120), cleanStr(body.detail, 500),
      dueDate, milestoneDate, current, total, isMonthly, actor, ts, ts
    )
    .run();

  const id = result.meta.last_row_id;
  if (isMonthly) {
    // Exactly one monthly target: flagging this goal unflags the rest.
    await env.DB.prepare('UPDATE goals SET is_monthly_target = 0 WHERE id != ?').bind(id).run();
  }

  await writeActivity(env, { actor, action: 'goal_added', note: title });

  const goal = await env.DB.prepare('SELECT * FROM goals WHERE id = ?').bind(id).first();
  return json({ goal }, 201);
}
