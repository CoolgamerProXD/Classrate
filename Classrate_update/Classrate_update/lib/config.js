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

// ── Profile pictures ────────────────────────────────────────────────────────
// Files in /avatars. Each account is permanently assigned one at random
// (derived from its uid — users can't choose, and it never changes).
// To add more: drop a file into /avatars and append its name here.
export const AVATARS = [
  // a01–a10: illustrated memes (AI-painted)
  'a01.jpg', 'a02.jpg', 'a03.jpg', 'a04.jpg', 'a05.jpg',
  'a06.jpg', 'a07.jpg', 'a08.jpg', 'a09.jpg', 'a10.jpg',
  // a11–a30: emoji-on-colour avatars (instant, tiny)
  'a11.svg', 'a12.svg', 'a13.svg', 'a14.svg', 'a15.svg',
  'a16.svg', 'a17.svg', 'a18.svg', 'a19.svg', 'a20.svg',
  'a21.svg', 'a22.svg', 'a23.svg', 'a24.svg', 'a25.svg',
  'a26.svg', 'a27.svg', 'a28.svg', 'a29.svg', 'a30.svg',
  // m01–m09: original digital art contributed by the site's creator ✨
  'm01.jpg', 'm02.jpg', 'm03.jpg', 'm04.jpg', 'm05.jpg',
  'm06.jpg', 'm07.jpg', 'm08.jpg', 'm09.jpg',
];

// Only emails ending in this domain can join (simple check — no OAuth).
// Change here or set the ALLOWED_DOMAIN env var in Vercel.
export const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'eq.edu.au').toLowerCase();

// A student needs at least this many ratings (per board) to appear on the
// leaderboard — stops one 5★ vote from crowning someone instantly.
export const MIN_VOTES = parseInt(process.env.MIN_VOTES || '3', 10);

// Max rating-submissions per account per day (one submission = one classmate).
export const DAILY_VOTE_LIMIT = parseInt(process.env.DAILY_VOTE_LIMIT || '200', 10);

export const MAX_NAME = 30;
