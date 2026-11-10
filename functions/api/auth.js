// POST /api/auth — body { passcode, actor }
// On a passcode match, sets an HttpOnly session cookie whose value is a
// SHA-256 token derived from the passcode. The passcode itself is never
// stored client-side and never echoed back.
import { SESSION_COOKIE, err, getActor, json, parseBody, sessionToken } from './_shared.js';

export async function onRequestPost({ request, env }) {
  if (!env.TEAM_PASSCODE) {
    return err('TEAM_PASSCODE is not configured on the server.', 500);
  }
  const body = await parseBody(request);
  if (!body || typeof body.passcode !== 'string') {
    return err('Body must be JSON with a passcode.', 400);
  }

  // Compare digests rather than the raw strings.
  const given = await sessionToken(body.passcode);
  const expected = await sessionToken(env.TEAM_PASSCODE);
  if (given !== expected) {
    return err('Incorrect passcode.', 401);
  }

  const token = expected;
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  return json(
    { ok: true, actor: getActor(request, body) },
    200,
    {
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    }
  );
}
