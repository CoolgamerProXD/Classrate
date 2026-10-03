// POST /api/join — ONE endpoint, THREE flows (no extra infra):
//   join:    { name, email, password, consent:true } — new student
//   re-join: same email + name + consent + password  — back on your old account
//   sign-in: { email, password }                     — returning student (fast path)
//   setup:   { email, password, setup:true }         — legacy accounts created
//             before passwords existed; works ONLY while account has no `pw`
//             field — after that, setup can never overwrite it (anti-hijack).
//
// Password storage = minimal data: ONE field `pw` on u:{uid} holding
// sha256(email + ':' + password) — email as built-in salt, zero extra keys,
// zero extra commands on join/sign-in (+1 HSET once on setup). Plaintext never
// touches the server logs/DB.
// Identity rule (frozen): same email ⇒ same uid, always. Tokens live in `t:*`.
// Sign-in cost: ONE request / 4 redis commands — students can sign in freely.
//ops• password reset (no email infra by design): console → HDEL u:{uid} pw
//   → student uses the setup flow once. Only admin can do this.

import { randomUUID, createHash } from 'node:crypto';
import { cmd, pipe, hObj, int } from '../lib/store.js';
import { ALLOWED_DOMAIN, MAX_NAME, MIN_VOTES, TRAIT_IDS } from '../lib/config.js';
import { cors, ok, bad, bodyOf } from '../lib/http.js';

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const emailRe = new RegExp(`^[a-z0-9](?:[a-z0-9._%+\\-]{0,62}[a-z0-9])?@${escRe(ALLOWED_DOMAIN)}$`);
const pwHash = (email, pw) => createHash('sha256').update(email + ':' + pw).digest('hex');
const pwBad = (pw) => typeof pw !== 'string' || pw.length < 4 || pw.length > 64;

// (lifetime) Board rows carry the display name inside the zset member
// ("uid~name~count") — rewrites on rename. Weekly lbw boards are disposable
// and catch up on the user's next vote.
async function refreshBoardNames(uid, name, u) {
  const stats = [['overall', int(u.ov_s), int(u.ov_c)]];
  for (const t of TRAIT_IDS) stats.push([t, int(u[`${t}_s`]), int(u[`${t}_c`])]);
  const writes = [];
  for (const [b, s, c] of stats) {
    if (c <= 0) continue;
    const members = await cmd('ZRANGE', `lb:${b}`, '0', '-1');
    const old = (members || []).filter((m) => m === uid || m.startsWith(uid + '~'));
    if (old.length) writes.push(['ZREM', `lb:${b}`, ...old]);
    if (c >= MIN_VOTES) writes.push(['ZADD', `lb:${b}`, s / c, `${uid}~${name}~${c}`]);
  }
  if (writes.length) await pipe(writes);
}

// Verify (or create) the password for an existing account.
// Returns true on success, or sends the failure response and returns false.
async function passwordGate(email, uid, u, b, res) {
  if (u.pw) {
    if (typeof b.password === 'string' && pwHash(email, b.password) === u.pw) return true;
    res.status(403).json({ error: 'Wrong password — try again', pwFail: true });
    return false;
  }
  // legacy account without a password: letting it be SET once, never overwritten
  if (b.setup === true || (b.name && b.password)) {
    if (pwBad(b.password)) { bad(res, 'Password needs 4–64 characters'); return false; }
    await cmd('HSET', `u:${uid}`, 'pw', pwHash(email, b.password));
    u.pw = '1';
    return true;
  }
  res.status(409).json({ error: 'That account has no password yet', needsSetup: true });
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return bad(res, 'POST only', 405);

  const b = bodyOf(req);
  const email = String(b.email || '').trim().toLowerCase();
  if (!emailRe.test(email)) return bad(res, `You need a @${ALLOWED_DOMAIN} school email to join`);
  const name = String(b.name || '').replace(/\s+/g, ' ').trim();

  // ── SIGN-IN / SETUP (returning student, email only) ──
  if (!name) {
    const uid = await cmd('GET', `email:${email}`);
    if (!uid) return bad(res, "No account for that email — tap 'New student' to join first", 404);
    const [u, banned] = await pipe([
      ['HGETALL', `u:${uid}`],
      ['SISMEMBER', 'banned', uid],
    ]);
    const uo = hObj(u);
    if (banned === 1) return bad(res, 'This account has been suspended — talk to your teacher', 403);
    if (!(await passwordGate(email, uid, uo, b, res))) return;
    const token = randomUUID() + randomUUID();
    await cmd('SET', `t:${token}`, uid);
    return ok(res, { token, uid, name: uo.name, pfp: uo.pfp != null ? int(uo.pfp) : null });
  }

  // ── JOIN (new, or same email re-entering) ──
  if (name.length < 2 || name.length > MAX_NAME) return bad(res, `Name must be 2–${MAX_NAME} characters`);
  if (!/^[\p{L}\p{N} .'\-]+$/u.test(name)) return bad(res, 'Name can only contain letters, numbers, spaces');
  if (b.consent !== true) return bad(res, 'You must agree to appear in ratings to join');
  if (pwBad(b.password)) return bad(res, 'Create a password — 4 to 64 characters');

  let uid = await cmd('GET', `email:${email}`);
  let plist = [];
  try { plist = JSON.parse((await cmd('GET', 'plist')) || '[]'); } catch { plist = []; }
  let pfp = null;

  if (uid) {
    // Same email → same account (re-join un-hides and refreshes the display name)
    const u = hObj(await cmd('HGETALL', `u:${uid}`));
    pfp = u.pfp != null ? int(u.pfp) : null;
    const banned = await cmd('SISMEMBER', 'banned', uid);
    if (banned === 1) return bad(res, 'This account has been suspended — talk to your teacher', 403);
    if (u.pw && pwHash(email, b.password) !== u.pw) {
      return res.status(403).json({ error: 'That email already has an account — use "I have an account"', pwFail: true });
    }
    if (!u.pw) await cmd('HSET', `u:${uid}`, 'pw', pwHash(email, b.password)); // legacy migration
    const renamed = u.name && u.name !== name;
    await cmd('HSET', `u:${uid}`, 'name', name, 'hidden', '0');
    const i = plist.findIndex((p) => p.u === uid);
    if (i >= 0) plist[i].n = name; else plist.push({ u: uid, n: name });
    if (renamed) await refreshBoardNames(uid, name, u);
  } else {
    uid = randomUUID();
    plist.push({ u: uid, n: name });
    await pipe([
      ['HSET', `u:${uid}`, 'name', name, 'email', email, 'pw', pwHash(email, b.password), 'joined', String(Date.now()), 'hidden', '0'],
      ['SET', `email:${email}`, uid],
    ]);
  }

  await cmd('SET', 'plist', JSON.stringify(plist));
  const token = randomUUID() + randomUUID();
  await cmd('SET', `t:${token}`, uid);
  ok(res, { token, uid, name, pfp });
}
