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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // ── Chores due today with alert_call on ──────────────────────────────────
    const { data: chores } = await supabase
      .from('chore_tasks')
      .select('id, title, due_date, due_time, alert_call, alert_call_lead_minutes, assigned_to_id, status')
      .eq('alert_call', true)
      .eq('due_date', todayStr)
      .in('status', ['todo', 'in_progress']);

    // ── Events today with alert_call on ──────────────────────────────────────
    // No lte('start_time', ...) prefilter here — start_time is stored as a
    // display string ("2:05 AM" from fmtTimeLabel, not always 24-hour), so a
    // lexicographic comparison against a 24-hour horizon slice is unreliable
    // (silently drops or keeps the wrong rows depending on AM/PM). The exact
    // to24Hour()-based check below is the only correctness-bearing filter;
    // this table is small enough per family that scanning today's
    // alert_call rows without the extra prefilter is cheap.
    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, title, date, start_time, alert_call, alert_call_lead_minutes, member_id, member_ids')
      .eq('alert_call', true)
      .eq('date', todayStr);

    const targets: RingTarget[] = [];

    for (const c of (chores ?? [])) {
      if (!c.due_time) continue;
      const t24 = to24Hour(c.due_time);
      if (!t24) continue;
      const dueAt = new Date(`${c.due_date}T${t24}:00`);
      const ringAt = new Date(dueAt.getTime() - (c.alert_call_lead_minutes ?? 10) * 60_000);
      if (ringAt <= now && now.getTime() - ringAt.getTime() < 90_000) {
        targets.push({
          itemType: 'chore', itemId: c.id, title: c.title, dueAt,
          memberIds: c.assigned_to_id ? [c.assigned_to_id] : [],
        });
      }
    }

    for (const e of (events ?? [])) {
      if (!e.start_time) continue;
      const t24 = to24Hour(e.start_time);
      if (!t24) continue;
      const dueAt = new Date(`${e.date}T${t24}:00`);
      const ringAt = new Date(dueAt.getTime() - (e.alert_call_lead_minutes ?? 10) * 60_000);
      if (ringAt <= now && now.getTime() - ringAt.getTime() < 90_000) {
        const ids = e.member_id ? [e.member_id] : (e.member_ids ?? []);
        targets.push({ itemType: 'event', itemId: e.id, title: e.title, dueAt, memberIds: ids });
      }
    }

    if (targets.length === 0) return json({ ok: true, rung: 0 });

    // ── Dedupe against call_reminder_log (one ring per item) ─────────────────
    const { data: alreadyRung } = await supabase
      .from('call_reminder_log')
      .select('item_type, item_id')
      .in('item_id', targets.map(t => t.itemId));
    const rungSet = new Set((alreadyRung ?? []).map((r: any) => `${r.item_type}:${r.item_id}`));
    const toRing = targets.filter(t => !rungSet.has(`${t.itemType}:${t.itemId}`));
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
      // Log even if delivery had zero tokens (no device registered) — the
      // window has passed either way, and re-ringing 90s later on a retry
      // sweep would be a duplicate, not a fix.
      await supabase.from('call_reminder_log').upsert(
        { item_type: t.itemType, item_id: t.itemId, fired_at: new Date().toISOString() },
        { onConflict: 'item_type,item_id' },
      );
      rung++;
    }

    return json({ ok: true, rung, results });

  } catch (e: any) {
    console.error('[call-reminder-sweeper]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
