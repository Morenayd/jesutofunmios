// GET /api/state — everything the SPA needs in one call:
// open tasks + latest 50 done, latest digest in full, digest index,
// deadlines sorted by date, latest 30 activity rows, every daily
// report from the last 7 days, all projects, all targets, the latest
// 50 captures, all people, and events from the last 7 days onward.
import {
  ensureCapturesTable,
  ensureEventsTable,
  ensurePeopleTable,
  ensureProjectsTable,
  ensureReportsTable,
  ensureTargetsTable,
  json,
} from './_shared.js';

export async function onRequestGet({ env }) {
  await ensureReportsTable(env);
  await ensureProjectsTable(env);
  await ensureTargetsTable(env);
  await ensureCapturesTable(env);
  await ensurePeopleTable(env);
  await ensureEventsTable(env);

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

  // Targets: earliest due first (undated last) — the first row is the one
  // the Today banner shows.
  const targets = await env.DB.prepare(
    `SELECT * FROM targets
     ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id ASC`
  ).all();

  // Captures: newest first, capped at 50 — enough for the badge count and
  // the Inbox list without shipping the whole archive.
  const captures = await env.DB.prepare(
    'SELECT * FROM captures ORDER BY id DESC LIMIT 50'
  ).all();

  // People: shortlist order (seeded order), oldest first.
  const people = await env.DB.prepare('SELECT * FROM people ORDER BY id ASC').all();

  // Events: classes and sessions, from 7 days ago onward, date order,
  // capped at 60 — enough for Today, the week strip and the calendar
  // without shipping the whole history.
  const eventsStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const events = await env.DB.prepare(
    'SELECT * FROM events WHERE date >= ? ORDER BY date ASC, id ASC LIMIT 60'
  )
    .bind(eventsStart)
    .all();

  return json({
    tasks: [...(open.results || []), ...(done.results || [])],
    latestDigest: latestDigest || null,
    digests: digests.results || [],
    deadlines: deadlines.results || [],
    activity: activity.results || [],
    reports: reports.results || [],
    projects: projects.results || [],
    targets: targets.results || [],
    captures: captures.results || [],
    people: people.results || [],
    events: events.results || [],
  });
}
