// GET /api/people — everyone joined (and not hidden), plus MY votes for
// star pre-fill. Rows include each person's chosen avatar index (p —
// null until they pick one). Just 4 database commands regardless of size.
import { pipe, hObj } from '../lib/store.js';
import { cors, ok, auth } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const uid = await auth(req, res);
  if (!uid) return;

  const [plistRaw, gaveArr] = await pipe([
    ['GET', 'plist'],
    ['HGETALL', `gave:${uid}`],
  ]);

  let plist = [];
  try { plist = JSON.parse(plistRaw || '[]'); } catch { plist = []; }
  const people = plist
    .map((x) => ({ uid: x.u, name: x.n, p: Number.isInteger(x.p) ? x.p : null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const myVotes = {};
  const g = hObj(gaveArr);
  for (const k in g) { try { myVotes[k] = JSON.parse(g[k]); } catch { /* ignore */ } }

  ok(res, { people, myVotes, you: uid });
}
