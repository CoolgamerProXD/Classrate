// GET /api/me — my own profile with averages (how I'm rated).
import { cmd, hObj, int } from '../lib/store.js';
import { TRAITS, MIN_VOTES } from '../lib/config.js';
import { cors, ok, bad, auth } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const uid = await auth(req, res);
  if (!uid) return;

  const o = hObj(await cmd('HGETALL', `u:${uid}`));
  if (!o.name) return bad(res, 'Account not found', 404);

  const traits = {};
  let votesReceived = 0;
  for (const t of TRAITS) {
    const s = int(o[`${t.id}_s`]);
    const c = int(o[`${t.id}_c`]);
    votesReceived += c;
    traits[t.id] = { count: c, avg: c ? Math.round((s / c) * 10) / 10 : 0 };
  }
  const oc = int(o.ov_c);
  const os = int(o.ov_s);
  ok(res, {
    uid,
    name: o.name,
    hidden: o.hidden === '1',
    pfp: o.pfp !== undefined && o.pfp !== '' ? int(o.pfp) : null,
    traits,
    votesReceived,
    overall: { count: oc, avg: oc ? Math.round((os / oc) * 10) / 10 : 0 },
    ranked: oc >= MIN_VOTES,
    needVotes: Math.max(0, MIN_VOTES - oc),
  });
}
