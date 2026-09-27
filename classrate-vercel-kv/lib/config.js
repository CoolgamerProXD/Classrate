// ── App configuration ────────────────────────────────────────────────────────
// Edit TRAITS to change what students rate on (label + emoji show in the UI).
// After editing on GitHub, Vercel auto-redeploys and the change is live.

export const TRAITS = [
  { id: 'agility',    label: 'Agility',    emoji: '🤸' },
  { id: 'strength',   label: 'Strength',   emoji: '💪' },
  { id: 'speed',      label: 'Speed',      emoji: '⚡' },
  { id: 'teamwork',   label: 'Teamwork',   emoji: '🤝' },
  { id: 'creativity', label: 'Creativity', emoji: '🎨' },
];

export const TRAIT_IDS = TRAITS.map((t) => t.id);

// Only emails ending in this domain can join (simple check — no OAuth).
// Change here or set the ALLOWED_DOMAIN env var in Vercel.
export const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'eq.edu.au').toLowerCase();

// A student needs at least this many ratings (per board) to appear on the
// leaderboard — stops one 5★ vote from crowning someone instantly.
export const MIN_VOTES = parseInt(process.env.MIN_VOTES || '3', 10);

// Max rating-submissions per account per day (one submission = one classmate).
export const DAILY_VOTE_LIMIT = parseInt(process.env.DAILY_VOTE_LIMIT || '200', 10);

export const MAX_NAME = 30;
