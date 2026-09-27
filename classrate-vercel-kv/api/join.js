// POST /api/join — create (or re-enter) your account.
// Body: { name, email, consent }
// Simple student check: the email must end in ALLOWED_DOMAIN (e.g. eq.edu.au).
// Re-joining with the same email returns the SAME account — so you can sign
// back in from a new device. (Deliberately lenient: see README "Verification".)

import { randomUUID } from 'node:crypto';
import { cmd, pipe } from '../lib/store.js';
import { ALLOWED_DOMAIN, MAX_NAME } from '../lib/config.js';
import { cors, ok, bad, bodyOf } from '../lib/http.js';

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const emailRe = new RegExp(`^[a-z0-9](?:[a-z0-9._%+\\-]{0,62}[a-z0-9])?@${escRe(ALLOWED_DOMAIN)}$`);

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return bad(res, 'POST only', 405);

  const b = bodyOf(req);
  const name = String(b.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > MAX_NAME) return bad(res, `Name must be 2–${MAX_NAME} characters`);
  if (!/^[\p{L}\p{N} .'\-]+$/u.test(name)) return bad(res, 'Name can only contain letters, numbers, spaces');
  if (b.consent !== true) return bad(res, 'You must agree to appear in ratings to join');

  const email = String(b.email || '').trim().toLowerCase();
  if (!emailRe.test(email)) return bad(res, `You need a @${ALLOWED_DOMAIN} school email to join`);

  let uid = await cmd('GET', `email:${email}`);
  if (uid) {
    // Same email → same account (re-join un-hides and refreshes the display name)
    await pipe([
      ['HSET', `u:${uid}`, 'name', name, 'hidden', '0'],
      ['SADD', 'people', uid],
    ]);
  } else {
    uid = randomUUID();
    await pipe([
      ['HSET', `u:${uid}`, 'name', name, 'email', email, 'joined', String(Date.now()), 'hidden', '0'],
      ['SET', `email:${email}`, uid],
      ['SADD', 'people', uid],
    ]);
  }

  const token = randomUUID() + randomUUID();
  await cmd('SET', `t:${token}`, uid);
  ok(res, { token, uid, name });
}
