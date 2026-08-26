// FamilyCube — Edge Function: call-reminder-sweeper
// Runs every minute. Finds chores/events with alert_call = true whose
// (due time - alert_call_lead_minutes) window has just been reached, and
// fires a VoIP push (raw APNs PushKit on iOS, FCM high-priority data
// message on Android) so the client's CallKit/ConnectionService integration
// rings a real incoming-call-style alert — not a normal notification.
//
// Deploy: supabase functions deploy call-reminder-sweeper
// Cron:   * * * * *  (every minute — lead-time windows are minute-grained)
// Secrets required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY (VoIP Services cert .p8 contents)
//   APNS_TOPIC (bundle id + ".voip", e.g. "com.familycube.ios.voip")
//   FCM_SERVICE_ACCOUNT (Firebase service account JSON, single-line string —
//     Android delivery via FCM V1 API; the Legacy server-key API is
//     deprecated/disabled on new projects, V1 needs OAuth2 service-account
//     auth instead)
//
// Until the APNs/FCM secrets above are configured, this function still runs
// the sweep and logs what WOULD have been sent (visible in the response and
// function logs) but skips actual delivery — safe to deploy ahead of the
// Apple VoIP cert being ready.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendVoipPush } from './apns.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface RingTarget {
  itemType: 'chore' | 'event';
  itemId: string;
  title: string;
  dueAt: Date;
  memberIds: string[];
}

// due_time/start_time are stored as display strings from the app's time
// pickers — "2:05 AM" (12-hour, what fmtTimeLabel in the quest/event forms
// actually writes) or occasionally a plain 24-hour "HH:MM". Feeding either
// straight into `new Date("${date}T${time}")` only works for 24-hour input;
// "2026-08-20T2:05 AM" is not a parseable date string and silently produces
// Invalid Date, which made every call reminder created through the normal
// Add/Edit forms never ring (ringAt comparisons against an Invalid Date are
// always false). Returns 24-hour "HH:MM", or null if unparseable.
function to24Hour(raw: string): string | null {
  const clean = raw.trim().toUpperCase();
  const ampm = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = ampm[2];
    if (ampm[3] === 'PM' && h !== 12) h += 12;
    if (ampm[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  const plain = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) return `${plain[1].padStart(2, '0')}:${plain[2]}`;
  return null;
}

// due_date/due_time (and date/start_time for events) are local wall-clock
// values with no offset of their own — chore_tasks.timezone /
// calendar_events.timezone exist as columns but were never actually
// populated by the app until this fix, silently defaulting to 'UTC' in
// Postgres. This function is a Deno edge function, which runs in UTC —
// `new Date("2026-08-20T09:01:00")` with no zone suffix is parsed as if it
// WERE UTC, so any family not literally in UTC got the wrong absolute ring
// time (5 hours early for US Central, for example — confirmed live: a
// chore set for "9:08 AM" local rang, if at all, against 09:08 UTC instead
// of the correct 14:08 UTC).
//
// Converts a local "YYYY-MM-DDTHH:MM:00" wall-clock string, as lived in the
// given IANA zone, into the correct UTC Date. Standard technique: format
// the SAME instant in both UTC and the target zone via Intl.DateTimeFormat,
// diff the two to get the zone's current offset (this naturally accounts
// for DST on whatever date is being checked, not just "now"), then apply
// that offset to the wall-clock value.
function localWallClockToUTC(wallClock: string, timeZone: string): Date {
  const naiveUTC = new Date(`${wallClock}Z`); // parsed as if UTC, i.e. same digits
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(naiveUTC);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
    // What clock time does naiveUTC's instant correspond to, IN timeZone?
    const asIfLocal = Date.UTC(
      Number(get('year')), Number(get('month')) - 1, Number(get('day')),
      Number(get('hour')), Number(get('minute')), Number(get('second')),
    );
    // The gap between that and naiveUTC's own digits is the zone's offset
    // at this instant — subtracting it from naiveUTC gives the real UTC
    // instant for the original wall-clock value.
    const offsetMs = asIfLocal - naiveUTC.getTime();
    return new Date(naiveUTC.getTime() - offsetMs);
  } catch {
    // Unknown/invalid IANA zone name — fall back to treating it as UTC
    // rather than throwing and skipping the reminder entirely.
    return naiveUTC;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    // A local due_date can map to either the day before or after in UTC
    // depending on the family's offset direction (e.g. 11pm local on the
    // 19th in a zone ahead of UTC is already the 20th in UTC, or 1am local
    // on the 20th in a zone behind UTC is still the 19th in UTC) — querying
    // only exactly today's UTC date could miss rows whose LOCAL due_date is
    // adjacent. Widen the DB filter to yesterday/today/tomorrow (still
    // cheap — indexed equality-in, not a range scan) and let the exact
    // per-row UTC conversion below be the real correctness check.
    const yesterdayStr = new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 10);
    const tomorrowStr = new Date(now.getTime() + 24 * 3600_000).toISOString().slice(0, 10);
    const dateWindow = [yesterdayStr, todayStr, tomorrowStr];

    // ── Chores due today (±1 day, see dateWindow) with alert_call on ─────────
    // No deleted_at filter here — unlike calendar_events, chore_tasks has no
    // such column; deleteChore() in choreStore.ts issues a real DELETE, so a
    // removed chore's row (and its alert_call flag with it) is gone outright
    // and can never be returned by this query in the first place.
    const { data: chores } = await supabase
      .from('chore_tasks')
      .select('id, title, due_date, due_time, timezone, alert_call, alert_call_lead_minutes, assigned_to_id, status')
      .eq('alert_call', true)
      .in('due_date', dateWindow)
      .in('status', ['todo', 'in_progress']);

    // ── Events today (±1 day) with alert_call on ──────────────────────────────
    // No lte('start_time', ...) prefilter here — start_time is stored as a
    // display string ("2:05 AM" from fmtTimeLabel, not always 24-hour), so a
    // lexicographic comparison against a 24-hour horizon slice is unreliable
    // (silently drops or keeps the wrong rows depending on AM/PM). The exact
    // to24Hour()-based check below is the only correctness-bearing filter;
    // this table is small enough per family that scanning today's
    // alert_call rows without the extra prefilter is cheap.
    //
    // is('deleted_at', null) — calendar_events is soft-deleted (deleteEvent()
    // in eventStore.ts stamps deleted_at rather than issuing a real DELETE).
    // Without this filter, deleting an event after its alert_call reminder
    // was scheduled but before the sweep runs did nothing to stop the ring —
    // the row was still returned here, the sweep would still fire a real
    // CallKit/ConnectionService ringing alert for an event the user had
    // already removed. updated_at is also pulled in now so it can be used
    // (see below) to detect an edited start time and avoid the mirror bug of
    // never re-ringing after a time change.
    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, title, date, start_time, timezone, alert_call, alert_call_lead_minutes, member_id, member_ids, updated_at')
      .eq('alert_call', true)
      .in('date', dateWindow)
      .is('deleted_at', null);

    const targets: RingTarget[] = [];

    for (const c of (chores ?? [])) {
      if (!c.due_time) continue;
      const t24 = to24Hour(c.due_time);
      if (!t24) continue;
      const dueAt = localWallClockToUTC(`${c.due_date}T${t24}:00`, (c as any).timezone || 'UTC');
      const ringAt = new Date(dueAt.getTime() - (c.alert_call_lead_minutes ?? 10) * 60_000);
      if (ringAt <= now && now.getTime() - ringAt.getTime() < 90_000) {
        targets.push({
          itemType: 'chore', itemId: c.id, title: c.title, dueAt,
          memberIds: c.assigned_to_id ? [c.assigned_to_id] : [],
        });
      }
    }

    const dueEvents: { id: string; title: string; dueAt: Date; memberIds: string[] }[] = [];
    for (const e of (events ?? [])) {
      if (!e.start_time) continue;
      const t24 = to24Hour(e.start_time);
      if (!t24) continue;
      const dueAt = localWallClockToUTC(`${e.date}T${t24}:00`, (e as any).timezone || 'UTC');
      const ringAt = new Date(dueAt.getTime() - (e.alert_call_lead_minutes ?? 10) * 60_000);
      if (ringAt <= now && now.getTime() - ringAt.getTime() < 90_000) {
        const ids = e.member_id ? [e.member_id] : (e.member_ids ?? []);
        dueEvents.push({ id: e.id, title: e.title, dueAt, memberIds: ids });
      }
    }

    // A "Pick up Leo from Soccer" event's member_id is Leo (the event is
    // ABOUT him) — but Leo is a kid with no VoIP token; the person who
    // actually needs to be reminded to go get him is whoever confirmed as
    // driver/helper on event_participants (reassign_event RPC's target).
    // Ring both: the confirmed driver/helper (the one who has to act) AND
    // the event's own member_id/member_ids (a teen with their own ride
    // reminder still wants their own phone to ring too). Passenger/
    // requester/approver roles are deliberately excluded — they aren't the
    // ones who need to physically show up.
    if (dueEvents.length > 0) {
      const { data: participantRows } = await supabase
        .from('event_participants')
        .select('event_id, member_id, role')
        .in('event_id', dueEvents.map(e => e.id))
        .in('role', ['driver', 'helper'])
        .eq('status', 'confirmed')
        .not('member_id', 'is', null);
      const participantsByEvent: Record<string, string[]> = {};
      for (const row of (participantRows ?? [])) {
        (participantsByEvent[row.event_id] ??= []).push(row.member_id as string);
      }
      for (const e of dueEvents) {
        const ids = [...new Set([...(participantsByEvent[e.id] ?? []), ...e.memberIds])];
        targets.push({ itemType: 'event', itemId: e.id, title: e.title, dueAt: e.dueAt, memberIds: ids });
      }
    }

    if (targets.length === 0) return json({ ok: true, rung: 0 });

    // ── Dedupe against call_reminder_log (one ring per item PER due time) ────
    // Keyed by (item_type, item_id, due_at) rather than just (item_type,
    // item_id) — the latter permanently "used up" an item's one-and-only
    // ring the first time it ever fired. If a parent edited an event's
    // start_time AFTER its original reminder had already rung (e.g. moved
    // a 3pm dentist appointment to 5pm the next day), the old log row for
    // that item_id/item_type pair was still there, so the sweep would skip
    // it forever afterward — the new, later time would silently never ring.
    // Including due_at (rounded to the minute, since dueAt already carries
    // whole-minute precision from wall-clock parsing) makes an edited time
    // a distinct key that's eligible to ring again, while same-run retries
    // of an unmodified item still collide on the identical due_at and stay
    // deduped. See supabase/migrations/*_call_reminder_log_due_at.sql for
    // the matching unique-constraint change (item_type,item_id,due_at).
    //
    // This used to be a plain SELECT-then-filter followed by an upsert
    // AFTER sendVoipPush() had already fired — a classic check-then-act
    // race. The cron fires every minute, but nothing guarantees a run
    // finishes within a minute (APNs JWT signing + an HTTP POST per
    // target, possibly dozens of targets); pg_cron does not skip an
    // overlapping tick if the previous invocation of this function is
    // still in flight, so two concurrent sweeps could both SELECT and see
    // "not yet rung" for the same (item_type,item_id,due_at), both pass
    // the in-memory filter, and both call sendVoipPush — a real double
    // ring on the phone — before either had written the log row that was
    // supposed to stop the other. The unique constraint on
    // call_reminder_log only ever protected the *log table* from a
    // duplicate row, never the *push*, because the write happened after
    // the send.
    //
    // Fixed by claiming each (item_type,item_id,due_at) atomically BEFORE
    // sending anything: upsert with ignoreDuplicates lets Postgres's own
    // unique constraint be the race judge — of two concurrent inserts for
    // the same key, exactly one wins and is returned; the other is
    // silently dropped (not an error) and simply doesn't come back in the
    // response, so it's excluded from toRing and never sends a push. This
    // makes the claim-and-send atomic instead of check-then-act.
    const dueAtKey = (d: Date) => new Date(Math.floor(d.getTime() / 60000) * 60000).toISOString();
    const claimRows = targets.map(t => ({
      item_type: t.itemType,
      item_id: t.itemId,
      due_at: dueAtKey(t.dueAt),
      fired_at: new Date().toISOString(),
    }));
    const { data: claimed, error: claimError } = await supabase
      .from('call_reminder_log')
      .upsert(claimRows, { onConflict: 'item_type,item_id,due_at', ignoreDuplicates: true })
      .select('item_type, item_id, due_at');
    if (claimError) {
      console.error('[call-reminder-sweeper] claim upsert failed, aborting sweep', claimError);
      return json({ ok: false, error: claimError.message }, 500);
    }
    const claimedSet = new Set((claimed ?? []).map((r: any) => `${r.item_type}:${r.item_id}:${r.due_at}`));
    const toRing = targets.filter(t => claimedSet.has(`${t.itemType}:${t.itemId}:${dueAtKey(t.dueAt)}`));
    if (toRing.length === 0) return json({ ok: true, rung: 0, alreadyRung: targets.length });

    // ── Resolve VoIP tokens for each target's members ─────────────────────────
    const allMemberIds = [...new Set(toRing.flatMap(t => t.memberIds))];
    const { data: tokenRows } = await supabase
      .from('voip_push_tokens')
      .select('member_id, token, platform')
      .in('member_id', allMemberIds.length ? allMemberIds : ['__none__']);
    const { data: memberRows } = await supabase
      .from('members')
      .select('id, name')
      .in('id', allMemberIds.length ? allMemberIds : ['__none__']);
    const nameOf: Record<string, string> = Object.fromEntries((memberRows ?? []).map((m: any) => [m.id, m.name]));
    const tokensByMember: Record<string, { token: string; platform: string }[]> = {};
    for (const row of (tokenRows ?? [])) {
      (tokensByMember[row.member_id] ??= []).push({ token: row.token, platform: row.platform });
    }

    let rung = 0;
    const results: Record<string, unknown>[] = [];
    for (const t of toRing) {
      const memberTokens = t.memberIds.flatMap(id => tokensByMember[id] ?? []);
      const delivery = await sendVoipPush(memberTokens, {
        callerName: t.title,
        itemType: t.itemType,
        itemId: t.itemId,
        dueAtIso: t.dueAt.toISOString(),
        memberNames: t.memberIds.map(id => nameOf[id]).filter(Boolean),
      });
      results.push({ itemType: t.itemType, itemId: t.itemId, title: t.title, delivery });
      // The claim row (item_type,item_id,due_at) was already written
      // atomically BEFORE this send, above — see the claim upsert. Even a
      // zero-token delivery keeps its claim (no separate write needed
      // here): the window has passed either way, and re-ringing 90s later
      // on a retry sweep would be a duplicate, not a fix. due_at being
      // part of the key means an edit that moves the item to a new time
      // is free to ring again on its own schedule regardless.
      rung++;
    }

    return json({ ok: true, rung, results });

  } catch (e: any) {
    console.error('[call-reminder-sweeper]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
