// POST /api/targets — add a monthly target.
// Body: { label (required), detail, current, total, due_date, actor }
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
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  await ensureTargetsTable(env);

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
  const result = await env.DB.prepare(
    'INSERT INTO targets (label, detail, current, total, due_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(label, cleanStr(body.detail, 500), current, total, dueDate, actor, ts, ts)
    .run();

  await writeActivity(env, { actor, action: 'target_added', note: label });

  const target = await env.DB.prepare('SELECT * FROM targets WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first();
  return json({ target }, 201);
}
