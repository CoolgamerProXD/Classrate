// POST /api/vote — rate ONE classmate on any/all traits in a single request.
// Body: { targetUid, ratings: { agility: 4, speed: 5, ... } }  (scores 1–5)
//
// Every vote maintains TWO parallel scoreboards:
//   • lifetime: u:* sums + lb:* zsets
//   • weekly:   wu:{week}:* sums + lbw:{week}:* zsets (ISO week — resets Monday;
//               keys expire ~29 days)
// Weekly deltas use vw:{week}:{v}:{t}:{trait} so a vote change in the SAME
// week adjusts (no recount), while a first vote of the week counts fresh —
// "activity this week" semantics.
//
// Re-voting updates your previous vote (averages shift by the difference).
// Packed zset members ("uid~name~count") must be SWEPT before ZADD or rows
// duplicate. All pre-reads run in ONE pipeline.

import { pipe, hObj, int } from '../lib/store.js';
import { TRAIT_IDS, MIN_VOTES, DAILY_VOTE_LIMIT } from '../lib/config.js';
import { weekKey } from '../lib/week.js';
import { cors, ok, bad, auth, bodyOf } from '../lib/http.js';

const WEEK_TTL = 2_500_000; // ~29 days — covers expired ISO weeks

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return bad(res, 'POST only', 405);

  const uid = await auth(req, res);
  if (!uid) return;

  const b = bodyOf(req);
  const targetUid = String(b.targetUid || '');
  if (!targetUid || targetUid === uid) return bad(res, "You can't rate yourself");

  // Validate ratings: known traits only, integer scores 1..5
  const inRatings = b.ratings && typeof b.ratings === 'object' ? b.ratings : {};
  const ratings = {};
  for (const [k, v] of Object.entries(inRatings)) {
    if (!TRAIT_IDS.includes(k)) continue;
    if (!Number.isInteger(v) || v < 1 || v > 5) return bad(res, 'Scores must be whole stars from 1 to 5');
    ratings[k] = v;
  }
  if (!Object.keys(ratings).length) return bad(res, 'Nothing to save — tap at least one star');

  const ratedTraits = Object.keys(ratings);
  const day = new Date().toISOString().slice(0, 10);
  const wk = weekKey();
  const rlKey = `rl:${uid}:${day}`;
  const voteKeys = ratedTraits.map((t) => `vote:${uid}:${targetUid}:${t}`);
  const wVoteKeys = ratedTraits.map((t) => `vw:${wk}:${uid}:${targetUid}:${t}`);

  // ONE pipeline: lifetime profile + lifetime-old votes + gave entry + rate
  // counter + weekly-old votes + weekly target sums
  const [targetArr, oldVotes, gaveJson, used, wOldVotes, wTargetArr] = await pipe([
    ['HGETALL', `u:${targetUid}`],
    ['MGET', ...voteKeys],
    ['HGET', `gave:${uid}`, targetUid],
    ['INCR', rlKey],
    ['MGET', ...wVoteKeys],
    ['HGETALL', `wu:${wk}:${targetUid}`],
  ]);

  if (used > DAILY_VOTE_LIMIT) return bad(res, 'Daily voting limit reached — try again tomorrow', 429);
  if (used === 1) await pipe([['EXPIRE', rlKey, 90000]]); // expiry once/day, not once/vote

  const target = hObj(targetArr);
  if (!target.name) return bad(res, 'That student was not found', 404);
  if (target.hidden === '1') return bad(res, 'That student is not participating');
  const wTarget = hObj(wTargetArr);

  // Phase 1 — pure math: lifetime + weekly deltas → writes + affected boards
  const writes = [];
  const zadds = [];
  let dOvS = 0, dOvC = 0;
  let wuDirty = false, wAddS = 0, wAddC = 0;

  for (const [i, t] of ratedTraits.entries()) {
    const score = ratings[t];
    const old = oldVotes[i] ? int(oldVotes[i]) : null;
    if (old === score) continue; // nothing changed for this trait, anywhere

    // ── weekly mirror ──
    const wOld = wOldVotes[i] ? int(wOldVotes[i]) : null;
    if (wOld !== score) {
      writes.push(['SET', `vw:${wk}:${uid}:${targetUid}:${t}`, String(score)]);
      writes.push(['EXPIRE', `vw:${wk}:${uid}:${targetUid}:${t}`, WEEK_TTL]);
      writes.push(['HINCRBY', `wu:${wk}:${targetUid}`, `${t}_s`, score - (wOld || 0)]);
      if (wOld == null) writes.push(['HINCRBY', `wu:${wk}:${targetUid}`, `${t}_c`, 1]);
      wuDirty = true;
      wAddS += score - (wOld || 0);
      if (wOld == null) wAddC += 1;

      const wS = int(wTarget[`${t}_s`]) + score - (wOld || 0);
      const wC = int(wTarget[`${t}_c`]) + (wOld == null ? 1 : 0);
      if (wC >= MIN_VOTES) zadds.push({ key: `lbw:${wk}:${t}`, score: wS / wC, member: `${targetUid}~${target.name}~${wC}` });
    }

    // ── lifetime ──
    const dS = score - (old || 0);
    const dC = old === null ? 1 : 0;
    writes.push(['SET', `vote:${uid}:${targetUid}:${t}`, String(score)]);
    writes.push(['HINCRBY', `u:${targetUid}`, `${t}_s`, dS]);
    if (dC) writes.push(['HINCRBY', `u:${targetUid}`, `${t}_c`, dC]);
    dOvS += dS;
    dOvC += dC;

    const nS = int(target[`${t}_s`]) + dS;
    const nC = int(target[`${t}_c`]) + dC;
    if (nC >= MIN_VOTES) zadds.push({ key: `lb:${t}`, score: nS / nC, member: `${targetUid}~${target.name}~${nC}` });
    else writes.push(['ZREM', `lb:${t}`, targetUid]); // legacy plain-uid cleanup
  }

  // overalls
  if (wuDirty) {
    writes.push(['EXPIRE', `wu:${wk}:${targetUid}`, WEEK_TTL]);
    let totS = wAddS, totC = wAddC;
    for (const t of TRAIT_IDS) { totS += int(wTarget[`${t}_s`]); totC += int(wTarget[`${t}_c`]); }
    if (totC >= MIN_VOTES) zadds.push({ key: `lbw:${wk}:overall`, score: totS / totC, member: `${targetUid}~${target.name}~${totC}` });
  }
  if (dOvS !== 0 || dOvC !== 0) {
    writes.push(['HINCRBY', `u:${targetUid}`, 'ov_s', dOvS]);
    if (dOvC) writes.push(['HINCRBY', `u:${targetUid}`, 'ov_c', dOvC]);
    const nS = int(target.ov_s) + dOvS;
    const nC = int(target.ov_c) + dOvC;
    if (nC >= MIN_VOTES) zadds.push({ key: 'lb:overall', score: nS / nC, member: `${targetUid}~${target.name}~${nC}` });
    else writes.push(['ZREM', 'lb:overall', targetUid]);
  }

  // Phase 2 — sweep stale packed members on affected boards, then ZADD
  if (zadds.length) {
    const olds = await pipe(zadds.map((z) => ['ZRANGE', z.key, '0', '-1']));
    for (let i = 0; i < zadds.length; i++) {
      const stale = (olds[i] || []).filter((m) => m === targetUid || m.startsWith(targetUid + '~'));
      if (stale.length) writes.push(['ZREM', zadds[i].key, ...stale]);
    }
    for (const z of zadds) {
      writes.push(['ZADD', z.key, z.score, z.member]);
      if (z.key.startsWith('lbw:')) writes.push(['EXPIRE', z.key, WEEK_TTL]);
    }
  }

  // Remember what I gave this person (star pre-fill next time)
  const gave = gaveJson ? JSON.parse(gaveJson) : {};
  Object.assign(gave, ratings);
  writes.push(['HSET', `gave:${uid}`, targetUid, JSON.stringify(gave)]);

  await pipe(writes);
  ok(res, { saved: true });
}
