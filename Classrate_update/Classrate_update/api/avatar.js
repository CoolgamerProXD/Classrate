// POST /api/avatar — choose your profile picture from the built-in pool.
// Body: { idx } — index into the AVATARS list (see lib/config.js).
// Stored on the account (works on every device) + mirrored into `plist`
// so everyone sees it in 1 command on people/board loads. ~4 commands total.

import { cmd } from '../lib/store.js';
import { AVATARS } from '../lib/config.js';
import { cors, ok, bad, auth, bodyOf } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return bad(res, 'POST only', 405);

  const uid = await auth(req, res);
  if (!uid) return;

  const b = bodyOf(req);
  const idx = b.idx;
  if (!Number.isInteger(idx) || idx < 0 || idx >= AVATARS.length) {
    return bad(res, 'Pick a valid avatar');
  }

  await cmd('HSET', `u:${uid}`, 'pfp', String(idx));

  let plist = [];
  try { plist = JSON.parse((await cmd('GET', 'plist')) || '[]'); } catch { plist = []; }
  const i = plist.findIndex((p) => p.u === uid);
  if (i >= 0) {
    plist[i].p = idx;
    await cmd('SET', 'plist', JSON.stringify(plist));
  }

  ok(res, { pfp: idx });
}
