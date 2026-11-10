// GET /api/digests/:id — one digest in full (the /api/state digest index
// only carries id/date/title, so the archive view fetches bodies through here).
import { err, json } from '../_shared.js';

export async function onRequestGet({ env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return err('Invalid digest id.', 400);
  const digest = await env.DB.prepare('SELECT * FROM digests WHERE id = ?').bind(id).first();
  if (!digest) return err('Digest not found.', 404);
  return json({ digest });
}
