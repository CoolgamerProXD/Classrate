# ClassRate ⭐ — Vercel KV edition

School-only, anonymous peer ratings with leaderboards. Students join with their
`@eq.edu.au` email, rate classmates on positive traits, and see top-20 boards.
Votes are stored per-account (editable, anti-spam) but are **never shown to
other students** — everyone is "Anonymous".

**This folder = the fast option.** Storage runs on **Vercel KV**, which you
create with one click *inside* Vercel — **no separate database account, no key
copying.** Votes are saved instantly. (If you'd rather not have any database
service at all, use the `classrate-github` folder instead — it stores data as
a JSON file in your repo.)

Zero npm dependencies. Everything over normal HTTPS/443. Client caches
aggressively → minimal requests on school networks.

---

## Deploy (≈ 10 minutes, all free)

### 1. Code on GitHub (5 min — no git required)
1. <https://github.com> → **New repository** → name `classrate` → **Private** → Create.
2. **Add file → Upload files** → drag in the whole contents of THIS folder
   (`api`, `lib`, `test` folders, `index.html`, `package.json`, `.gitignore`) → Commit.
   - If folders won't drag: **Add file → Create new file**, type e.g. `api/join.js`
     as the filename and paste contents. Repeat per file.

### 2. Vercel project (3 min)
1. <https://vercel.com> → sign up **with GitHub** → **Add New → Project** → **Import** `classrate`.
2. Framework auto-detects as *Other* — correct. Click **Deploy**.
   ⚠️ The first deploy "works" but the APP will error until step 3 — normal.

### 3. Attach the database — 1 click (2 min)
1. In your Vercel project → **Storage** tab → **Create KV** (name: `classrate`).
   - Pick region **Sydney (ap-southeast-2)** if it asks.
2. **Connect** it to this project when prompted — Vercel injects the
   `KV_REST_API_*` credentials automatically. Nothing to copy.
3. **Deployments** tab → ⋯ on the latest → **Redeploy**.
4. Open your URL (`https://classrate-xxx.vercel.app`) → join → share. 🚀

**Every future edit on GitHub auto-redeploys the site.**

Optional env vars (Settings → Environment Variables) — defaults already work:
`ALLOWED_DOMAIN=eq.edu.au` · `MIN_VOTES=3` · `DAILY_VOTE_LIMIT=200`

---

## Changing the traits
Edit **[`lib/config.js`](lib/config.js)** on GitHub (pencil → commit). The whole
site follows that one list. Keep `id`s lowercase-letters-only.

## Admin (Vercel → Storage → your KV → Data Browser / CLI)
- **Ban a troll:** run `SADD banned <their-uid>` — takes effect instantly.
  Find uids under keys `u:*`.
- **Full reset:** `FLUSHALL` wipes everything (fresh start).

## Keeping a copy on your PC
1. Save `index.html` from the repo.
2. Near the top of the `<script>`, set:
   `const PC_API_BASE = 'https://YOUR-APP.vercel.app';`
3. Double-click — it talks to your live backend over HTTPS.

---

## Verification tradeoff (important)
Join checks only that the email *ends in* `@eq.edu.au` — it doesn't prove
ownership (deliberate: no Microsoft/Google OAuth). If impersonation becomes a
problem, the upgrade is a one-time email code (Resend free tier = 100 emails/day,
school inboxes work at school) — one small endpoint, no other changes.

**School-friendly guardrails built in:** opt-in to appear · positive traits
only · no comments · top-only boards (never a bottom list) · 3-rating minimum
to rank · daily vote caps · self-rating blocked · one-click hide · ban list.
Still: tell a teacher. ✅

## Files
| File | Job |
|---|---|
| `index.html` | Entire frontend (UI + logic), no external resources |
| `api/join.js` | Join with name + school email → device token |
| `api/people.js` | Classmates list + my existing votes (star pre-fill) |
| `api/vote.js` | Save one classmate's ratings in a single request; averages + leaderboards update; vote changes shift by the delta |
| `api/leaderboard.js` | Top 20 per board (3+ ratings required) |
| `api/me.js` · `api/optout.js` | My stats · hide myself |
| `lib/config.js` | Traits, domain, limits — the knobs you'll edit |
| `lib/store.js` | Tiny REST client for the database (no dependencies) |
| `test/smoke.mjs` | Offline tests: `node test/smoke.mjs` (31 checks) |
