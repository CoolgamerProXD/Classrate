// POST /api/optout — hide me: I'm removed from the people list + every board.
// Your account stays, so joining again with the same email brings you back.
import { pipe } from '../lib/store.js';
import { TRAIT_IDS } from '../lib/config.js';
import { cors, ok, bad, auth } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return bad(res, 'POST only', 405);

  const uid = await auth(req, res);
  if (!uid) return;

  const writes = [
    ['SREM', 'people', uid],
    ['HSET', `u:${uid}`, 'hidden', '1'],
    ['ZREM', 'lb:overall', uid],
    ...TRAIT_IDS.map((t) => ['ZREM', `lb:${t}`, uid]),
  ];
  await pipe(writes);
  ok(res, { hidden: true });
}
