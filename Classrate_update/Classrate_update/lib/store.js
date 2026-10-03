// Thin helper over the Upstash Redis REST API.
// Everything is plain HTTPS/443 — no drivers, no npm packages, no open ports.

// Vercel KV injects KV_REST_API_URL / KV_REST_API_TOKEN automatically when you
// create a KV store and connect it to your project. If you ever switch to a
// plain Upstash database instead, it also accepts UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN (same thing under the hood).
function cfg() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'No database credentials found. In Vercel: Storage → Create KV → connect to this project, then Redeploy ' +
      '(or set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN manually).'
    );
  }
  return { url: url.replace(/\/+$/, ''), token };
}

// Run a single Redis command, e.g. cmd('GET', 'key')
export async function cmd(...args) {
  const { url, token } = cfg();
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error('Redis error: ' + j.error);
  return j.result;
}

// Run a batch of commands in ONE HTTPS request (fewer round trips).
// commands = [ ['HGETALL','k1'], ['SET','k2','v'], ... ]
export async function pipe(commands) {
  if (!commands.length) return [];
  const { url, token } = cfg();
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const j = await r.json();
  return j.map((x) => {
    if (x.error) throw new Error('Redis error: ' + x.error);
    return x.result;
  });
}

// Redis HGETALL returns a flat array [field, value, field, value...] → object
export function hObj(arr) {
  const o = {};
  if (arr) for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}

// Safe int parse for Redis string values
export const int = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
