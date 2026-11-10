// GET /api/state — everything the SPA needs in one call:
// open tasks + latest 50 done, latest digest in full, digest index,
// deadlines sorted by date, latest 30 activity rows, every daily
// report from the last 7 days, and all projects.
import { ensureProjectsTable, ensureReportsTable, json } from './_shared.js';

export async function onRequestGet({ env }) {
  await ensureReportsTable(env);
  await ensureProjectsTable(env);

  const open = await env.DB.prepare(
    `SELECT * FROM tasks WHERE status != 'done'
     ORDER BY CASE WHEN due IS NULL THEN 1 ELSE 0 END, due ASC, id ASC`
  ).all();

  const done = await env.DB.prepare(
    `SELECT * FROM tasks WHERE status = 'done'
     ORDER BY updated_at DESC, id DESC LIMIT 50`
  ).all();

  const latestDigest = await env.DB.prepare(
    'SELECT * FROM digests ORDER BY date DESC, id DESC LIMIT 1'
  ).first();

  const digests = await env.DB.prepare(
    'SELECT id, date, title, created_by, created_at FROM digests ORDER BY date DESC, id DESC'
  ).all();

  const deadlines = await env.DB.prepare(
    'SELECT * FROM deadlines ORDER BY date ASC, id ASC'
  ).all();

  const activity = await env.DB.prepare(
    'SELECT * FROM activity ORDER BY id DESC LIMIT 30'
  ).all();

  // Last 7 days of daily reports (today plus the six days before), newest
  // date first. Full rows — the Reports view renders them without extra calls.
  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const reports = await env.DB.prepare(
    'SELECT * FROM reports WHERE date >= ? ORDER BY date DESC, author ASC'
  )
    .bind(weekStart)
    .all();

  // Projects: active first, then paused, then done; oldest first within a
  // group, so the sidebar group keeps its seeded order.
  const projects = await env.DB.prepare(
    `SELECT * FROM projects
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, id ASC`
  ).all();

  return json({
    tasks: [...(open.results || []), ...(done.results || [])],
    latestDigest: latestDigest || null,
    digests: digests.results || [],
    deadlines: deadlines.results || [],
    activity: activity.results || [],
    reports: reports.results || [],
    projects: projects.results || [],
  });
}
