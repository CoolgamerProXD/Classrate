// POST /api/vote — rate ONE classmate on any/all traits in a single request.
// Body: { targetUid, ratings: { agility: 4, speed: 5, ... } }  (scores 1–5)
//
// Re-voting updates your previous vote (averages shift by the difference —
// no double counting). The voter's uid is stored so votes are accountable and
// editable, but it is NEVER exposed by any endpoint → everyone stays
// "Anonymous" to other students.
//
// Aggregates (sums + counts) live on the target's user hash and leaderboards
// are Redis sorted sets, so reading a board is one cheap query and this whole
// vote is ~3 HTTPS calls total.

import { pipe, hObj, int } from '../lib/store.js';
import { TRAIT_IDS, MIN_VOTES, DAILY_VOTE_LIMIT } from '../lib/config.js';
import { cors, ok, bad, auth, bodyOf } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return bad(res, 'POST only', 405);

  const uid = await auth(req, res);
  if (!uid) return;

  const b = bodyOf(req);
  const targetUid = String(b.targetUid || '');
  if (!targetUid || targetUid === uid) return bad(res, "You can't rate yourself");

  // Validate ratings: only known traits, integer scores 1..5
  const inRatings = b.ratings && typeof b.ratings === 'object' ? b.ratings : {};
  const ratings = {};
  for (const [k, v] of Object.entries(inRatings)) {
    if (!TRAIT_IDS.includes(k)) continue;
    if (!Number.isInteger(v) || v < 1 || v > 5) return bad(res, 'Scores must be whole stars from 1 to 5');
    ratings[k] = v;
  }
  if (!Object.keys(ratings).length) return bad(res, 'Nothing to save — tap at least one star');

  // Target must exist and be participating
  const target = hObj(await pipe([['HGETALL', `u:${targetUid}`]]).then((r) => r[0]));
  if (!target.name) return bad(res, 'That student was not found', 404);
  if (target.hidden === '1') return bad(res, 'That student is not participating');

  // Daily per-account rate limit (1 count per submission, not per trait)
  const day = new Date().toISOString().slice(0, 10);
  const rlKey = `rl:${uid}:${day}`;
  const [used] = await pipe([['INCR', rlKey], ['EXPIRE', rlKey, 90000]]).then((r) => r);
  if (used > DAILY_VOTE_LIMIT) return bad(res, 'Daily voting limit reached — try again tomorrow', 429);

  // Read my previous votes for these traits + my previous "gave" entry
  const ratedTraits = Object.keys(ratings);
  const keys = ratedTraits.map((t) => `vote:${uid}:${targetUid}:${t}`);
  const [oldVotes, gaveJson] = await pipe([
    ['MGET', ...keys],
    ['HGET', `gave:${uid}`, targetUid],
  ]);

  // Compute deltas and build one batched write
  const writes = [];
  let dOvS = 0, dOvC = 0;
  for (const [i, t] of ratedTraits.entries()) {
    const score = ratings[t];
    const old = oldVotes[i] ? int(oldVotes[i]) : null;
    if (old === score) continue;

    const dS = score - (old || 0);
    const dC = old === null ? 1 : 0;
    writes.push(['SET', `vote:${uid}:${targetUid}:${t}`, String(score)]);
    writes.push(['HINCRBY', `u:${targetUid}`, `${t}_s`, dS]);
    if (dC) writes.push(['HINCRBY', `u:${targetUid}`, `${t}_c`, dC]);
    dOvS += dS;
    dOvC += dC;

    const nS = int(target[`${t}_s`]) + dS;
    const nC = int(target[`${t}_c`]) + dC;
    writes.push(nC >= MIN_VOTES
      ? ['ZADD', `lb:${t}`, nS / nC, targetUid]
      : ['ZREM', `lb:${t}`, targetUid]);
  }
  if (dOvS !== 0 || dOvC !== 0) {
    writes.push(['HINCRBY', `u:${targetUid}`, 'ov_s', dOvS]);
    if (dOvC) writes.push(['HINCRBY', `u:${targetUid}`, 'ov_c', dOvC]);
    const nS = int(target.ov_s) + dOvS;
    const nC = int(target.ov_c) + dOvC;
    writes.push(nC >= MIN_VOTES
      ? ['ZADD', 'lb:overall', nS / nC, targetUid]
      : ['ZREM', 'lb:overall', targetUid]);
  }

  // Remember what I gave this person (so the app can pre-fill next time)
  const gave = gaveJson ? JSON.parse(gaveJson) : {};
  Object.assign(gave, ratings);
  writes.push(['HSET', `gave:${uid}`, targetUid, JSON.stringify(gave)]);

  await pipe(writes);
  ok(res, { saved: true });
}
