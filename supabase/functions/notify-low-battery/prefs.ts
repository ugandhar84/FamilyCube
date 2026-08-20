/**
 * Shared preference-gate helper for edge functions.
 *
 * Usage:
 *   const allowed = await canNotify(db, userId, 'notif_lost');
 *   if (!allowed) return;
 *
 * For bulk filtering (e.g. send-lost-alert):
 *   const allowedIds = await filterByPref(db, userIds, 'notif_lost');
 */

export type NotifFlag =
  | 'notif_daily'
  | 'notif_health'
  | 'notif_appointment'
  | 'notif_lost'
  | 'notif_family'
  | 'notif_playdate'
  | 'notif_chat'
  | 'notif_event'
  | 'notif_post_like'
  | 'notif_post_comment'
  | 'notif_follow'
  | 'notif_mention';

interface ProfilePrefs {
  id: string;
  notif_daily: boolean | null;
  notif_health: boolean | null;
  notif_appointment: boolean | null;
  notif_lost: boolean | null;
  notif_family: boolean | null;
  notif_playdate: boolean | null;
  notif_chat: boolean | null;
  notif_event: boolean | null;
  notif_post_like: boolean | null;
  notif_post_comment: boolean | null;
  notif_follow: boolean | null;
  notif_mention: boolean | null;
  quiet_hours_enabled: boolean | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
}

/** Returns true if the current time in the user's timezone falls inside a quiet window. */
function inQuietHours(start: string, end: string, timezone: string | null): boolean {
  const now = new Date();
  let nowMins: number;
  if (timezone) {
    try {
      const parts = Intl.DateTimeFormat('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
      }).formatToParts(now);
      const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10);
      const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
      nowMins = h * 60 + m;
    } catch {
      nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    }
  } else {
    nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  if (startMins >= endMins) return nowMins >= startMins || nowMins < endMins;
  return nowMins >= startMins && nowMins < endMins;
}

const SELECT_COLS = 'id,notif_daily,notif_health,notif_appointment,notif_lost,notif_family,notif_playdate,notif_chat,notif_event,notif_post_like,notif_post_comment,notif_follow,notif_mention,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone';

/** Fetch prefs for a single user — returns null if profile not found. */
async function fetchPrefs(db: any, userId: string): Promise<ProfilePrefs | null> {
  const { data } = await db.from('profiles').select(SELECT_COLS).eq('id', userId).single();
  return data ?? null;
}

/** Fetch prefs for multiple users at once. */
async function fetchPrefsMany(db: any, userIds: string[]): Promise<Map<string, ProfilePrefs>> {
  if (userIds.length === 0) return new Map();
  const { data } = await db.from('profiles').select(SELECT_COLS).in('id', userIds);
  const map = new Map<string, ProfilePrefs>();
  for (const row of (data ?? [])) map.set(row.id, row);
  return map;
}

function prefsAllow(prefs: ProfilePrefs, flag: NotifFlag): boolean {
  if (prefs[flag] === false) return false;
  if (prefs.quiet_hours_enabled && prefs.quiet_hours_start && prefs.quiet_hours_end) {
    if (inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end, prefs.timezone)) return false;
  }
  return true;
}

/** Check if a single user should receive a notification. */
export async function canNotify(db: any, userId: string, flag: NotifFlag): Promise<boolean> {
  const prefs = await fetchPrefs(db, userId);
  if (!prefs) return true;
  return prefsAllow(prefs, flag);
}

/**
 * Filter a list of user IDs to those who should receive a notification.
 * Returns { allowed, blocked } for logging.
 */
export async function filterByPref(
  db: any,
  userIds: string[],
  flag: NotifFlag,
): Promise<{ allowed: string[]; blocked: string[] }> {
  const map = await fetchPrefsMany(db, userIds);
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const uid of userIds) {
    const prefs = map.get(uid);
    if (!prefs || prefsAllow(prefs, flag)) allowed.push(uid);
    else blocked.push(uid);
  }
  return { allowed, blocked };
}
