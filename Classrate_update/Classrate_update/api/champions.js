// GET /api/champions — current #1 of Overall + every trait, for the
// Hall of Fame strip. One pipeline (~7 commands), cached by CDN + client.
import { pipe, hObj, int } from '../lib/store.js';
import { TRAIT_IDS } from '../lib/config.js';
import { cors, ok, auth } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const uid = await auth(req, res);
  if (!uid) return;

  const boards = ['overall', ...TRAIT_IDS];
  const reads = boards.map((b) => ['ZREVRANGE', `lb:${b}`, '0', '0', 'WITHSCORES']);
  reads.push(['GET', 'plist']);
  const results = await pipe(reads);

  let plist = [];
  try { plist = JSON.parse(results[results.length - 1] || '[]'); } catch { plist = []; }
  const amap = new Map();
  for (const x of plist) if (Number.isInteger(x.p)) amap.set(x.u, x.p);

  const champs = {};
  const legacyLookups = [];
  boards.forEach((b, i) => {
    champs[b] = null;
    const pairs = results[i];
    if (pairs && pairs.length) {
      const member = String(pairs[0]);
      const avg = Math.round(parseFloat(pairs[1]) * 10) / 10;
      if (member.includes('~')) {
        const [id, name] = member.split('~');
        champs[b] = { uid: id, name, avg, p: amap.has(id) ? amap.get(id) : null };
      } else {
        legacyLookups.push({ b, uid: member, avg });
      }
    }
  });
  if (legacyLookups.length) {
    const hs = await pipe(legacyLookups.map((l) => ['HGETALL', `u:${l.uid}`]));
    for (const [i, l] of legacyLookups.entries()) {
      const p = hObj(hs[i]);
      if (p.name && p.hidden !== '1') {
        champs[l.b] = { uid: l.uid, name: p.name, avg: l.avg, p: amap.has(l.uid) ? amap.get(l.uid) : null, count: int(p[l.b === 'overall' ? 'ov_c' : `${l.b}_c`]) };
      }
    }
  }

  res.setHeader('Cache-Control', 'public, s-maxage=120');
  ok(res, { champs, you: uid });
}
