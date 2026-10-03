// Shared HTTP helpers: CORS (so a local copy of index.html on a PC still works),
// JSON responses, and token auth.

import { cmd } from './store.js';

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function ok(res, data) {
  res.status(200).json(data);
}

export function bad(res, msg, code = 400) {
  res.status(code).json({ error: msg });
}

export function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

// Reads "Authorization: Bearer <token>" → uid, or sends an error and returns null.
export async function auth(req, res) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) { bad(res, 'Not signed in', 401); return null; }
  const uid = await cmd('GET', `t:${token}`);
  if (!uid) { bad(res, 'Session expired — sign in again', 401); return null; }
  const banned = await cmd('SISMEMBER', 'banned', uid);
  if (banned === 1) { bad(res, 'This account has been suspended', 403); return null; }
  return uid;
}
