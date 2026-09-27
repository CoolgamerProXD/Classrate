// GET /api/config — public app config (traits, limits). Cached by CDN + client.
import { TRAITS, MIN_VOTES, ALLOWED_DOMAIN } from '../lib/config.js';
import { cors } from '../lib/http.js';

export default function handler(req, res) {
  if (cors(req, res)) return;
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.status(200).json({ traits: TRAITS, minVotes: MIN_VOTES, allowedDomain: ALLOWED_DOMAIN });
}
