// GET /api/leaderboard?board=overall|agility|... — top 20 for one board.
// zset members are packed as "uid~name~count"; avatar indices (p) are
// resolved from the `plist` key (ONE extra command) so a fresh avatar pick
// shows up on boards instantly. Legacy plain-uid members still work.
import { pipe, hObj, int } from '../lib/store.js';
import { TRAIT_IDS } from '../lib/config.js';
import { weekKey } from '../lib/week.js';
import { cors, ok, bad, auth } from '../lib/http.js';

const TOP_N = 20;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const uid = await auth(req, res);
  if (!uid) return;

  const board = String((req.query && req.query.board) || 'overall');
  const isWeekly = board === 'weekly';
  if (!isWeekly && board !== 'overall' && !TRAIT_IDS.includes(board)) return bad(res, 'Unknown board');
  const wk = isWeekly ? weekKey() : null;
  const zkey = isWeekly ? `lbw:${wk}:overall` : `lb:${board}`;

  const [pairs, total, plistRaw] = await pipe([
    ['ZREVRANGE', zkey, '0', String(TOP_N - 1), 'WITHSCORES'],
    ['ZCARD', zkey],
    ['GET', 'plist'],
  ]);

  const amap = new Map(); // uid -> chosen avatar index
  try {
    for (const x of JSON.parse(plistRaw || '[]')) if (Number.isInteger(x.p)) amap.set(x.u, x.p);
  } catch { /* ignore */ }

  const rows = [];
  const legacy = [];
  if (pairs && pairs.length) {
    for (let i = 0; i < pairs.length; i += 2) {
      const member = String(pairs[i]);
      const avg = Math.round(parseFloat(pairs[i + 1]) * 10) / 10;
      const tilde = member.indexOf('~');
      if (tilde > 0) {
        const [id, name, c] = member.split('~');
        rows.push({ uid: id, name, count: int(c), avg });
      } else {
        legacy.push({ uid: member, avg });
      }
    }
    if (legacy.length) {
      const hs = await pipe(legacy.map((l) => ['HGETALL', `u:${l.uid}`]));
      for (const [i, l] of legacy.entries()) {
        const p = hObj(hs[i]);
        if (!p.name || p.hidden === '1') continue;
        const countField = board === 'overall' || isWeekly ? 'ov_c' : `${board}_c`;
        rows.push({ uid: l.uid, name: p.name, count: int(p[countField]), avg: l.avg });
      }
    }
  }

  for (const r of rows) r.p = amap.has(r.uid) ? amap.get(r.uid) : null;

  rows.sort((a, b) => b.avg - a.avg || b.count - a.count);
  rows.length = Math.min(rows.length, TOP_N);
  rows.forEach((r, i) => (r.rank = i + 1));

  res.setHeader('Cache-Control', 'public, s-maxage=120');
  ok(res, { board, rows, total: int(total), you: uid, week: wk });
}
