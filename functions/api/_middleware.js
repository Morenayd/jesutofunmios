// JesutofunmiOS — auth gate for every /api/* route except /api/auth itself.
// A request is authenticated when its lhq_session cookie equals the token
// derived from the server-side TEAM_PASSCODE secret.
import { ensureReportsTable, json, readSessionCookie, sessionToken } from './_shared.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Self-migration: make sure the reports table exists before any handler
  // runs. Idempotent and cheap; lets existing databases pick the table up
  // with no manual step.
  await ensureReportsTable(env);

  if (url.pathname === '/api/auth') return next();

  if (!env.TEAM_PASSCODE) {
    return json({ error: 'TEAM_PASSCODE is not configured on the server.' }, 500);
  }

  const expected = await sessionToken(env.TEAM_PASSCODE);
  if (readSessionCookie(request) !== expected) {
    return json({ error: 'Not signed in.' }, 401);
  }

  return next();
}
