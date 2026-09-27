// GET /api/people — everyone who joined (and hasn't hidden themselves),
// plus MY votes so the app can pre-fill the stars I've already given.
import { pipe, hObj } from '../lib/store.js';
import { cors, ok, auth } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const uid = await auth(req, res);
  if (!uid) return;

  const [members, gaveArr] = await pipe([
    ['SMEMBERS', 'people'],
    ['HGETALL', `gave:${uid}`],
  ]);

  let people = [];
  if (members && members.length) {
    const hs = await pipe(members.map((m) => ['HGETALL', `u:${m}`]));
    people = members
      .map((m, i) => ({ uid: m, ...hObj(hs[i]) }))
      .filter((p) => p.name && p.hidden !== '1')
      .map((p) => ({ uid: p.uid, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // gave:{uid} is a hash: targetUid -> JSON {trait: score, ...}
  const myVotes = {};
  const g = hObj(gaveArr);
  for (const k in g) { try { myVotes[k] = JSON.parse(g[k]); } catch { /* ignore */ } }

  ok(res, { people, myVotes, you: uid });
}
