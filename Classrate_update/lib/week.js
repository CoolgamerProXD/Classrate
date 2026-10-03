// ISO-8601 week key like "26W39" (UTC). Used to scope the weekly leaderboard
// keys (`lbw:*`, `wu:*`, `vw:*`) so the weekly race resets every Monday.
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - day + 3); // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((t - firstThu) / 6048e5);
  return `${String(t.getUTCFullYear()).slice(2)}W${String(week).padStart(2, '0')}`;
}
