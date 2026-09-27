// Offline smoke test — runs the real API handlers against an in-memory
// fake of the Upstash REST API. No internet needed.
// Run:  node test/smoke.mjs

// ── env BEFORE importing handlers (config is read at import time) ──
process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
process.env.ALLOWED_DOMAIN = 'eq.edu.au';
process.env.MIN_VOTES = '2';
process.env.DAILY_VOTE_LIMIT = '200';

// ── in-memory Redis ──
const store = new Map(); // key -> { t: 'str'|'hash'|'set'|'zset', v }
const ent = (k, t, mk) => {
  let e = store.get(k);
  if (!e) { e = { t, v: mk() }; store.set(k, e); }
  return e;
};
const isInt = (s) => /^-?\d+$/.test(String(s));

function run(args) {
  const [c, ...a] = args.map(String);
  const C = c.toUpperCase();
  const key = a[0];
  switch (C) {
    case 'GET': { const e = store.get(key); return e ? e.v : null; }
    case 'SET': { store.set(key, { t: 'str', v: a[1] }); return 'OK'; }
    case 'MGET': return a.map((k) => (store.get(k) ? store.get(k).v : null));
    case 'INCR': {
      const e = ent(key, 'str', () => '0');
      e.v = String(parseInt(e.v, 10) + 1); return parseInt(e.v, 10);
    }
    case 'EXPIRE': return 1;
    case 'HSET': {
      const e = ent(key, 'hash', () => new Map());
      let added = 0;
      for (let i = 1; i < a.length; i += 2) {
        if (!e.v.has(a[i])) added++;
        e.v.set(a[i], a[i + 1]);
      }
      return added;
    }
    case 'HGET': { const e = store.get(key); return e ? (e.v.get(a[1]) ?? null) : null; }
    case 'HGETALL': {
      const e = store.get(key); const out = [];
      if (e) for (const [f, v] of e.v) out.push(f, v);
      return out;
    }
    case 'HINCRBY': {
      const e = ent(key, 'hash', () => new Map());
      const cur = isInt(e.v.get(a[1])) ? parseInt(e.v.get(a[1]), 10) : 0;
      const n = cur + parseInt(a[2], 10);
      e.v.set(a[1], String(n)); return n;
    }
    case 'SADD': {
      const e = ent(key, 'set', () => new Set());
      let added = 0;
      for (let i = 1; i < a.length; i++) if (!e.v.has(a[i])) { e.v.add(a[i]); added++; }
      return added;
    }
    case 'SREM': { const e = store.get(key); let r = 0; if (e) for (let i = 1; i < a.length; i++) if (e.v.delete(a[i])) r++; return r; }
    case 'SMEMBERS': { const e = store.get(key); return e ? [...e.v] : []; }
    case 'SISMEMBER': { const e = store.get(key); return e && e.v.has(a[1]) ? 1 : 0; }
    case 'ZADD': {
      const e = ent(key, 'zset', () => new Map());
      e.v.set(a[2], parseFloat(a[1])); return 1;
    }
    case 'ZREM': { const e = store.get(key); return e && e.v.delete(a[1]) ? 1 : 0; }
    case 'ZCARD': { const e = store.get(key); return e ? e.v.size : 0; }
    case 'ZREVRANGE': {
      const e = store.get(key); if (!e) return [];
      const start = parseInt(a[1], 10), stop = parseInt(a[2], 10);
      let rows = [...e.v.entries()];
      rows.sort((x, y) => (y[1] - x[1]) || (y[0] < x[0] ? -1 : 1)); // score desc, member desc (redis-like)
      rows = rows.slice(start, stop + 1);
      if (a[3] && a[3].toUpperCase() === 'WITHSCORES') {
        const out = [];
        for (const [m, s] of rows) out.push(m, String(s));
        return out;
      }
      return rows.map(([m]) => m);
    }
    default: throw new Error('mock: unsupported command ' + C);
  }
}

// fake fetch emulating Upstash REST
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  const isPipe = String(url).endsWith('/pipeline');
  const out = isPipe ? body.map((c) => ({ result: run(c) })) : { result: run(body) };
  return { json: async () => out };
};

// ── request/response mocks ──
const mkRes = () => {
  const r = {
    statusCode: 200, data: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.data = d; return this; },
    end() { return this; },
  };
  return r;
};
const mkReq = (method, { token, body, query } = {}) => ({
  method,
  headers: token ? { authorization: 'Bearer ' + token } : {},
  body, query,
});
const call = async (fn, method, opts) => {
  const res = mkRes();
  await fn(mkReq(method, opts), res);
  return res;
};

// ── tiny assert ──
let passed = 0;
const ok = (cond, msg) => {
  if (!cond) { console.error('❌ FAIL:', msg); process.exit(1); }
  passed++; console.log('✅', msg);
};

// ── import handlers AFTER env is set ──
const config = (await import('../api/config.js')).default;
const join = (await import('../api/join.js')).default;
const me = (await import('../api/me.js')).default;
const people = (await import('../api/people.js')).default;
const vote = (await import('../api/vote.js')).default;
const leaderboard = (await import('../api/leaderboard.js')).default;
const optout = (await import('../api/optout.js')).default;

// ── tests ──
const cfg = await call(config, 'GET');
ok(cfg.data.traits.length === 5 && cfg.data.allowedDomain === 'eq.edu.au', 'config serves traits + domain');

let r = await call(join, 'POST', { body: { name: 'Alice A', email: 'alice@eq.edu.au', consent: true } });
ok(r.statusCode === 200 && r.data.token, 'alice joins with @eq.edu.au');
const A = r.data;

r = await call(join, 'POST', { body: { name: 'Bob B', email: 'bob@eq.edu.au', consent: true } });
const B = r.data; ok(B.token, 'bob joins');

r = await call(join, 'POST', { body: { name: 'Cleo C', email: 'cleo@eq.edu.au', consent: true } });
const Cuser = r.data; ok(Cuser.token, 'cleo joins');

r = await call(join, 'POST', { body: { name: 'Dave D', email: 'dave@gmail.com', consent: true } });
ok(r.statusCode === 400, 'gmail address rejected');

r = await call(join, 'POST', { body: { name: 'NoConsent', email: 'x@eq.edu.au', consent: false } });
ok(r.statusCode === 400, 'join without consent rejected');

r = await call(people, 'GET', { token: A.token });
ok(r.data.people.length === 3 && Object.keys(r.data.myVotes).length === 0, 'people lists 3 students, no votes yet');

r = await call(vote, 'POST', { token: A.token, body: { targetUid: A.uid, ratings: { agility: 5 } } });
ok(r.statusCode === 400, 'self-vote blocked');

r = await call(vote, 'POST', { token: A.token, body: { targetUid: B.uid, ratings: { agility: 7 } } });
ok(r.statusCode === 400, 'score 7 blocked');

r = await call(vote, 'POST', { token: B.token, body: { targetUid: B.uid } });
ok(r.statusCode === 400, 'empty ratings blocked');

r = await call(vote, 'POST', { token: A.token, body: { targetUid: B.uid, ratings: { agility: 5, strength: 3 } } });
ok(r.data.saved === true, 'alice rates bob (5 agility, 3 strength)');

r = await call(me, 'GET', { token: B.token });
ok(r.data.traits.agility.avg === 5 && r.data.traits.agility.count === 1, 'bob sees agility 5.0 from 1 rating');
ok(r.data.overall.avg === 4 && r.data.overall.count === 2, 'bob overall = 4.0 from 2 ratings');
ok(r.data.ranked === true, 'bob is ranked (minVotes=2)');

r = await call(leaderboard, 'GET', { token: A.token, query: { board: 'overall' } });
ok(r.data.rows.length === 1 && r.data.rows[0].name === 'Bob B' && r.data.rows[0].avg === 4, 'overall board: bob at 4.0');
r = await call(leaderboard, 'GET', { token: A.token, query: { board: 'agility' } });
ok(r.data.rows.length === 0, 'agility board empty until 2 agility ratings');

r = await call(vote, 'POST', { token: Cuser.token, body: { targetUid: B.uid, ratings: { agility: 4 } } });
ok(r.data.saved, 'cleo rates bob (4 agility)');
r = await call(leaderboard, 'GET', { token: A.token, query: { board: 'agility' } });
ok(r.data.rows.length === 1 && r.data.rows[0].avg === 4.5 && r.data.rows[0].count === 2, 'agility board: bob 4.5 from 2 ratings');

// change a vote: alice changes agility 5 → 3
r = await call(vote, 'POST', { token: A.token, body: { targetUid: B.uid, ratings: { agility: 3 } } });
ok(r.data.saved, 'alice changes her agility vote 5 → 3');
r = await call(me, 'GET', { token: B.token });
ok(r.data.traits.agility.avg === 3.5 && r.data.traits.agility.count === 2, 'bob agility now 3.5 (avg of 3,4) — count unchanged');
ok(r.data.overall.avg === 3.3 && r.data.overall.count === 3, 'bob overall 3.3 from 3 ratings (delta applied)');

r = await call(leaderboard, 'GET', { token: A.token, query: { board: 'overall' } });
ok(r.data.rows[0].avg === 3.3, 'overall board updated to 3.3');

r = await call(people, 'GET', { token: A.token });
ok(r.data.myVotes[B.uid].agility === 3 && r.data.myVotes[B.uid].strength === 3, 'myVotes pre-fill shows updated votes');

r = await call(optout, 'POST', { token: B.token });
ok(r.data.hidden === true, 'bob opts out');
r = await call(leaderboard, 'GET', { token: A.token, query: { board: 'overall' } });
ok(r.data.rows.length === 0, 'bob removed from boards');
r = await call(people, 'GET', { token: A.token });
ok(r.data.people.every((p) => p.uid !== B.uid), 'bob removed from people list');

r = await call(join, 'POST', { body: { name: 'Bob B', email: 'bob@eq.edu.au', consent: true } });
ok(r.data.uid === B.uid && r.data.token, 'rejoining with same email recovers the same account');
r = await call(people, 'GET', { token: A.token });
ok(r.data.people.some((p) => p.uid === B.uid), 'bob visible again after rejoining');

// banned user cannot vote
run(['SADD', 'banned', A.uid]);
r = await call(vote, 'POST', { token: A.token, body: { targetUid: Cuser.uid, ratings: { agility: 5 } } });
ok(r.statusCode === 403, 'banned account blocked (admin ban works)');

// no token → 401
r = await call(people, 'GET', {});
ok(r.statusCode === 401, 'no token → 401');

// daily rate limit trips at the configured cap
for (let i = 0; i < 200; i++) {
  await call(vote, 'POST', { token: Cuser.token, body: { targetUid: B.uid, ratings: { agility: 4 } } });
}
r = await call(vote, 'POST', { token: Cuser.token, body: { targetUid: B.uid, ratings: { agility: 4 } } });
ok(r.statusCode === 429, 'daily vote limit enforced (200/day → 429)');

console.log(`\n🎉 All ${passed} checks passed.`);
