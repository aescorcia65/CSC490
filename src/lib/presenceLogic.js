/** How stale last_seen may be before we treat "is_online: true" as not actually active (mirror client inactivity threshold). */
export const PRESENCE_MAX_AGE_MS = 4 * 60 * 1000;

/** No heartbeat/activity pings for this long → mark row offline ourselves. */
export const PRESENCE_INACTIVITY_OFFLINE_MS = 3 * 60 * 1000;

/** How often we upsert our own presence while the app is foregrounded and active enough. */
export const PRESENCE_HEARTBEAT_MS = 45 * 1000;

/** Recompute everyone's online map (drop stale peers). */
export const PRESENCE_STALE_REFRESH_MS = 60 * 1000;

export function presenceRowIndicatesOnline(row, nowMs = Date.now(), maxAgeMs = PRESENCE_MAX_AGE_MS) {
  if (!row?.user_id) return false;
  if (!row.is_online) return false;
  const ls = row.last_seen ? new Date(row.last_seen).getTime() : 0;
  if (!Number.isFinite(ls)) return false;
  return nowMs - ls < maxAgeMs;
}

/** @param {{ user_id?: string, is_online?: boolean, last_seen?: string }[]} rows */
export function presenceRowsToOnlineMap(rows, nowMs = Date.now(), maxAgeMs = PRESENCE_MAX_AGE_MS) {
  const out = {};
  for (const r of rows || []) {
    if (presenceRowIndicatesOnline(r, nowMs, maxAgeMs)) out[r.user_id] = true;
  }
  return out;
}

export function subscribeSelfPresenceHeartbeat(supabase, userId, {
  inactivityMs = PRESENCE_INACTIVITY_OFFLINE_MS,
  intervalMs = PRESENCE_HEARTBEAT_MS,
} = {}) {
  const lastActivity = { t: Date.now() };
  const touch = () => {
    lastActivity.t = Date.now();
  };

  const targets = [["pointerdown", touch], ["keydown", touch], ["touchstart", touch]];
  targets.forEach(([ev, fn]) => window.addEventListener(ev, fn, true));
  window.addEventListener(
    "visibilitychange",
    () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") touch();
    },
    true,
  );

  async function heartbeat() {
    const idleMs = Date.now() - lastActivity.t;
    const idle = idleMs > inactivityMs;
    await supabase.from("user_presence").upsert(
      {
        user_id: userId,
        is_online: !idle,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  heartbeat().catch(() => {});

  const tid = window.setInterval(() => {
    void heartbeat();
  }, intervalMs);

  const offlineOnUnload = () => {
    void supabase
      .from("user_presence")
      .upsert(
        {
          user_id: userId,
          is_online: false,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .then(() => {})
      .catch(() => {});
  };
  window.addEventListener("pagehide", offlineOnUnload);
  window.addEventListener("beforeunload", offlineOnUnload);

  return () => {
    targets.forEach(([ev, fn]) => window.removeEventListener(ev, fn, true));
    window.clearInterval(tid);
    window.removeEventListener("pagehide", offlineOnUnload);
    window.removeEventListener("beforeunload", offlineOnUnload);
    offlineOnUnload();
  };
}
