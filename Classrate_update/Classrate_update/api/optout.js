// POST /api/optout — hide me: removed from the people list + every board
// (sweeping both packed "uid~name~count" and legacy plain-uid members).
// Your account stays, so joining again with the same email brings you back.
import { cmd, pipe, hObj } from '../lib/store.js';
import { TRAIT_IDS } from '../lib/config.js';
import { cors, ok, bad, auth } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return bad(res, 'POST only', 405);

  const uid = await auth(req, res);
  if (!uid) return;

  const u = hObj(await cmd('HGETALL', `u:${uid}`));
  if (!u.name) return bad(res, 'Account not found', 404);

  const writes = [['HSET', `u:${uid}`, 'hidden', '1']];
  for (const b of ['overall', ...TRAIT_IDS]) {
    const members = await cmd('ZRANGE', `lb:${b}`, '0', '-1');
    const mine = (members || []).filter((m) => m === uid || m.startsWith(uid + '~'));
    if (mine.length) writes.push(['ZREM', `lb:${b}`, ...mine]);
  }

  let plist = [];
  try { plist = JSON.parse((await cmd('GET', 'plist')) || '[]'); } catch { plist = []; }
  const next = plist.filter((p) => p.u !== uid);
  if (next.length !== plist.length) writes.push(['SET', 'plist', JSON.stringify(next)]);

  await pipe(writes);
  ok(res, { hidden: true });
}
