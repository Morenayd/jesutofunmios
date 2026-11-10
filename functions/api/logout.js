// POST /api/logout — clears the session cookie.
import { SESSION_COOKIE, json } from './_shared.js';

export async function onRequestPost() {
  return json(
    { ok: true },
    200,
    {
      'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    }
  );
}
