// GET /api/leaderboard?board=overall|agility|... — top 20 for one board.
// Only students with >= MIN_VOTES ratings can be on a board; there is no
// "bottom" list anywhere — ranked lists show the top only.
import { pipe, hObj, int } from '../lib/store.js';
import { TRAIT_IDS } from '../lib/config.js';
import { cors, ok, bad, auth } from '../lib/http.js';

const TOP_N = 20;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const uid = await auth(req, res);
  if (!uid) return;

  const board = String((req.query && req.query.board) || 'overall');
  if (board !== 'overall' && !TRAIT_IDS.includes(board)) return bad(res, 'Unknown board');

  const [pairs, total] = await pipe([
    ['ZREVRANGE', `lb:${board}`, '0', String(TOP_N - 1), 'WITHSCORES'],
    ['ZCARD', `lb:${board}`],
  ]);

  const rows = [];
  if (pairs && pairs.length) {
    const uids = [];
    for (let i = 0; i < pairs.length; i += 2) uids.push(pairs[i]);
    const hs = await pipe(uids.map((u) => ['HGETALL', `u:${u}`]));
    let rank = 0;
    for (let i = 0; i < uids.length; i++) {
      const p = hObj(hs[i]);
      if (!p.name || p.hidden === '1') continue;
      rank++;
      const countField = board === 'overall' ? 'ov_c' : `${board}_c`;
      rows.push({
        rank,
        uid: uids[i],
        name: p.name,
        avg: Math.round(parseFloat(pairs[i * 2 + 1]) * 10) / 10,
        count: int(p[countField]),
      });
    }
  }

  res.setHeader('Cache-Control', 'public, s-maxage=30');
  ok(res, { board, rows, total: int(total), you: uid });
}
