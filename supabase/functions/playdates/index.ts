/**
 * PawBond — Playdates Edge Function v2
 *
 * Actions (require user JWT):
 *   request        — send a request with proposed date/time/place
 *   respond        — accept | counter_propose | decline (pending or scheduling state)
 *   reschedule     — propose a new time on an already-accepted playdate
 *   cancel         — cancel an accepted or scheduling playdate
 *   withdraw       — A withdraws their own pending/scheduling request
 *   complete       — both parties confirm playdate happened (v2)
 *   block          — explicitly block a pet from making requests
 *
 * Actions (no user JWT — called by Supabase pg_cron):
 *   reminders      — hourly: expire stale pending requests + send reminder pushes
 *
 * Deploy: supabase functions deploy playdates
 * Cron:   SELECT cron.schedule('playdate-reminders','0 * * * *',
 *           $$SELECT net.http_post('https://<ref>.supabase.co/functions/v1/playdates',
 *             '{"action":"reminders"}','application/json')$$);
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requirePro } from '../_shared/requirePro.ts';

// ─── constants ────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

// Auto-block after this many declines from the same pet pair within 30 days
const AUTO_BLOCK_THRESHOLD = 3;

// Max outbound requests per pet per 24 hours
const RATE_LIMIT_DAILY = 10;

// ─── helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function svc() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function getUser(authHeader: string | null) {
  if (!authHeader) return null;
  const { data: { user } } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  ).auth.getUser(authHeader.replace('Bearer ', ''));
  return user ?? null;
}

// Owner or caretaker can perform general playdate actions (cancel, reschedule).
async function isPetMember(db: ReturnType<typeof svc>, petId: string, userId: string): Promise<boolean> {
  const { data: pet } = await db.from('pets').select('owner_id').eq('id', petId).single();
  if (pet?.owner_id === userId) return true;
  const { data: fam } = await db.from('pet_family').select('id')
    .eq('pet_id', petId).eq('user_id', userId).eq('role', 'caretaker').limit(1);
  return !!fam?.length;
}

// Only the pet owner can initiate or respond to playdate requests.
// Caretakers can cancel/reschedule but NOT negotiate new playdates.
async function isPetOwner(db: ReturnType<typeof svc>, petId: string, userId: string): Promise<boolean> {
  const { data: pet } = await db.from('pets').select('owner_id').eq('id', petId).single();
  return pet?.owner_id === userId;
}

async function getTokens(db: ReturnType<typeof svc>, userId: string): Promise<string[]> {
  const { data } = await db.from('push_tokens').select('token').eq('user_id', userId);
  return (data ?? []).map((t: any) => t.token).filter((t: string) => t.startsWith('ExponentPushToken'));
}

async function canNotify(db: ReturnType<typeof svc>, userId: string, flag: string): Promise<boolean> {
  const { data: prefs } = await db
    .from('profiles')
    .select(`notif_playdate,notif_chat,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone,${flag}`)
    .eq('id', userId).single();
  if (!prefs) return true;
  if ((prefs as any)[flag] === false) return false;
  if (prefs.quiet_hours_enabled && prefs.quiet_hours_start && prefs.quiet_hours_end) {
    const now = new Date();
    let nowMins: number;
    if (prefs.timezone) {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: prefs.timezone as string,
        }).formatToParts(now);
        const h = parseInt(parts.find((p: any) => p.type === 'hour')?.value   ?? '0', 10);
        const m = parseInt(parts.find((p: any) => p.type === 'minute')?.value ?? '0', 10);
        nowMins = h * 60 + m;
      } catch {
        nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      }
    } else {
      nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    }
    const [sh, sm] = (prefs.quiet_hours_start as string).split(':').map(Number);
    const [eh, em] = (prefs.quiet_hours_end as string).split(':').map(Number);
    const startMins = sh * 60 + sm, endMins = eh * 60 + em;
    const inQuiet = startMins >= endMins
      ? nowMins >= startMins || nowMins < endMins
      : nowMins >= startMins && nowMins < endMins;
    if (inQuiet) return false;
  }
  return true;
}

// Returns "@handle" (or first name fallback) to disambiguate same-named pets
async function ownerFirst(db: ReturnType<typeof svc>, ownerId: string): Promise<string | null> {
  const { data } = await db.from('profiles').select('handle, full_name').eq('id', ownerId).single();
  if (data?.handle) return `@${data.handle}`;
  return (data?.full_name as string | null)?.split(' ')[0]?.trim() ?? null;
}
function petLabel(first: string | null, emoji: string, name: string): string {
  return first ? `${emoji} ${name} (${first})` : `${emoji} ${name}`;
}

async function push(
  db: ReturnType<typeof svc>,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  opts: { color?: string; badge?: number; urgency?: string; flag?: string } = {},
) {
  const flag = opts.flag ?? 'notif_playdate';
  if (!(await canNotify(db, userId, flag))) return;
  const tokens = await getTokens(db, userId);
  if (!tokens.length) return;
  const messages = tokens.map(to => ({
    to, sound: 'default', title, body, data,
    priority: 'high', channelId: 'social', badge: opts.badge ?? 1,
    android: { color: opts.color ?? '#FF8C55', colorized: true, priority: 'high' },
    ios: { sound: true, badge: opts.badge ?? 1, interruptionLevel: opts.urgency ?? 'timeSensitive' },
  }));
  await fetch(EXPO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
}

function petAge(birthday: string | null): string {
  if (!birthday) return 'Age unknown';
  const b = new Date(birthday), t = new Date();
  let y = t.getFullYear() - b.getFullYear();
  let m = t.getMonth() - b.getMonth();
  if (m < 0) { y--; m += 12; }
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}

function fmtProposal(date: string | null, time: string | null, location: string | null, endTime?: string | null): string {
  let dateStr = date ?? null;
  if (date) {
    try {
      const d = new Date(`${date}T00:00:00`);
      dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch { /* use raw date */ }
  }
  const fmt12 = (t: string) => {
    try {
      const [h, m] = t.substring(0, 5).split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    } catch { return t.substring(0, 5); }
  };
  const timeStr = time ? `at ${fmt12(time)}${endTime ? ` – ${fmt12(endTime)}` : ''}` : null;
  return [dateStr, timeStr, location ? `· ${location}` : null]
    .filter(Boolean).join(' ');
}

// Fetch the single pending proposal for a request (there is at most one, enforced by DB index).
async function getPendingProposal(db: ReturnType<typeof svc>, requestId: string) {
  const { data } = await db.from('playdate_proposals')
    .select('id, proposed_by_pet_id, proposed_by_owner_id, proposed_date, proposed_time, proposed_end_time, proposed_location, round')
    .eq('request_id', requestId)
    .eq('status', 'pending')
    .single();
  return data ?? null;
}

// ─── action handlers ──────────────────────────────────────────────────────────

async function handleRequest(db: ReturnType<typeof svc>, user: any, body: any) {
  const { from_pet_id, to_pet_id, proposed_date, proposed_time, proposed_end_time, proposed_location, message } = body;
  console.log(`[request] from=${from_pet_id} to=${to_pet_id} user=${user.id}`);

  if (!from_pet_id || !to_pet_id) return json({ error: 'from_pet_id and to_pet_id required' }, 400);
  if (!proposed_date || !proposed_time) {
    return json({ error: 'proposed_date and proposed_time required' }, 400);
  }

  const [{ data: fp }, { data: tp }] = await Promise.all([
    db.from('pets').select('id, name, emoji, owner_id, breed, birthday, avatar_url, species').eq('id', from_pet_id).single(),
    db.from('pets').select('id, name, emoji, owner_id, species').eq('id', to_pet_id).single(),
  ]);
  if (!fp || !tp) return json({ error: 'Pet not found' }, 404);
  // Only the pet owner can initiate a playdate request — caretakers cannot
  if (!(await isPetOwner(db, from_pet_id, user.id))) return json({ error: 'Only the pet owner can request a playdate' }, 403);
  if (fp.owner_id === tp.owner_id) return json({ error: 'Cannot request your own pet' }, 400);
  if (fp.species && tp.species && fp.species.toLowerCase() !== tp.species.toLowerCase())
    return json({ error: 'Playdate requests can only be sent to pets of the same species' }, 400);

  // Subscription gate: free tier gets 2 playdate requests per calendar month
  const tierResult = await requirePro(db, user.id);
  if (tierResult === 'free') {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count: monthlyCount } = await db.from('playdate_requests')
      .select('id', { count: 'exact', head: true })
      .eq('from_owner_id', user.id)
      .gte('created_at', monthStart.toISOString());
    if ((monthlyCount ?? 0) >= 2) {
      return json({ error: 'Free plan allows 2 playdate requests per month. Upgrade to Pro for unlimited.', code: 'SUBSCRIPTION_LIMIT' }, 402);
    }
  }

  // Block check — either direction
  const { data: blocked } = await db.from('playdate_blocks')
    .select('id')
    .or(`and(blocker_pet_id.eq.${to_pet_id},blocked_pet_id.eq.${from_pet_id}),and(blocker_pet_id.eq.${from_pet_id},blocked_pet_id.eq.${to_pet_id})`)
    .limit(1);
  if (blocked?.length) return json({ error: 'Requests are blocked between these pets' }, 403);

  // Rate limit: max RATE_LIMIT_DAILY requests per pet per 24 hours
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count: recentCount } = await db.from('playdate_requests')
    .select('id', { count: 'exact', head: true })
    .eq('from_pet_id', from_pet_id)
    .gte('created_at', since);
  if ((recentCount ?? 0) >= RATE_LIMIT_DAILY) {
    return json({ error: 'Rate limit reached — try again tomorrow' }, 429);
  }

  // Mutual request check: B already has a pending/scheduling request to A
  const { data: mutual } = await db.from('playdate_requests')
    .select('id')
    .eq('from_pet_id', to_pet_id)
    .eq('to_pet_id', from_pet_id)
    .in('status', ['pending', 'scheduling'])
    .limit(1);
  if (mutual?.length) {
    return json({
      error: 'Mutual request exists',
      mutual_request_exists: true,
      existing_request_id: mutual[0].id,
    }, 409);
  }

  // Insert request row
  const { data: req, error: reqErr } = await db.from('playdate_requests').insert({
    from_pet_id,
    to_pet_id,
    from_owner_id: fp.owner_id,
    to_owner_id:   tp.owner_id,
    status:        'pending',
    proposed_date,
    proposed_time,
    proposed_end_time: proposed_end_time ?? null,
    proposed_location,
    message: message ?? null,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  }).select('id').single();
  if (reqErr || !req) return json({ error: reqErr?.message ?? 'Could not create request' }, 500);

  // Insert first proposal row
  await db.from('playdate_proposals').insert({
    request_id:           req.id,
    proposed_by_pet_id:   from_pet_id,
    proposed_by_owner_id: fp.owner_id,
    proposed_date,
    proposed_time,
    proposed_end_time: proposed_end_time ?? null,
    proposed_location,
    message: message ?? null,
    status: 'pending',
    round:  1,
  });

  // Notify B
  const age       = petAge(fp.birthday);
  const propSummary = fmtProposal(proposed_date, proposed_time, proposed_location, proposed_end_time ?? null);
  const notifBody = [propSummary, message ? `💬 ${(message as string).substring(0, 120)}` : null, `${fp.breed || 'Mixed'} ${age}`].filter(Boolean).join('\n');
  const dedupKey  = `playdate_req:${req.id}`;
  const fpFirst   = await ownerFirst(db, fp.owner_id);
  const fpLabel   = petLabel(fpFirst, fp.emoji, fp.name);

  // Pre-check so push isn't sent again if the row already exists (re-send race)
  const { data: existingReqNotif } = await db.from('notification_logs')
    .select('id').eq('user_id', tp.owner_id).eq('dedup_key', dedupKey).maybeSingle();
  const skipReqPush = !!existingReqNotif;

  await db.from('notification_logs').upsert({
    user_id: tp.owner_id,
    title: `${fpLabel} wants a playdate!`,
    body: notifBody,
    type: 'playdate_request',
    read: false,
    dedup_key: dedupKey,
    data: { request_id: req.id, from_pet_id, to_pet_id, from_pet_name: fp.name, from_pet_emoji: fp.emoji },
  }, { onConflict: 'user_id,dedup_key' });

  if (!skipReqPush) {
    const tokens = await getTokens(db, tp.owner_id);
    if (tokens.length && await canNotify(db, tp.owner_id, 'notif_playdate')) {
      const msgs = tokens.map((to: string) => ({
        to, sound: 'default',
        title: `${fpLabel} wants to play!`,
        body:  propSummary,
        mutableContent: true,
        data:  { type: 'playdate_request', request_id: req.id, from_pet_id, to_pet_id, from_pet_name: fp.name, from_pet_emoji: fp.emoji, from_pet_avatar: fp.avatar_url },
        priority: 'high', channelId: 'social', badge: 1,
        android: { color: '#FF8C55', colorized: true, priority: 'high', ...(fp.avatar_url ? { largeIcon: fp.avatar_url } : {}) },
        ios: { sound: true, badge: 1, interruptionLevel: 'timeSensitive', threadId: 'playdate_requests' },
        ...(fp.avatar_url ? { bigPictureUrl: fp.avatar_url, largeIconUrl: fp.avatar_url } : {}),
      }));
      await fetch(EXPO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(msgs) });
    }
  }

  console.log(`[request] ✅ request_id=${req.id}`);
  return json({ success: true, request_id: req.id });
}

async function handleRespond(db: ReturnType<typeof svc>, user: any, body: any) {
  const { request_id, respond_action: action, proposed_date, proposed_time, proposed_end_time, proposed_location, message } = body;
  console.log(`[respond] request_id=${request_id} action=${action} user=${user.id}`);

  if (!request_id || !['accept', 'counter_propose', 'decline'].includes(action)) {
    return json({ error: 'request_id and respond_action (accept|counter_propose|decline) required' }, 400);
  }
  if (action === 'counter_propose' && (!proposed_date || !proposed_time)) {
    return json({ error: 'proposed_date and proposed_time required for counter_propose' }, 400);
  }

  const { data: req } = await db.from('playdate_requests')
    .select('id, status, from_pet_id, to_pet_id, from_owner_id, to_owner_id, from_pet:from_pet_id(id,name,emoji,avatar_url), to_pet:to_pet_id(id,name,emoji,avatar_url)')
    .eq('id', request_id).single();
  if (!req) return json({ error: 'Request not found' }, 404);
  if (!['pending', 'scheduling'].includes(req.status)) return json({ error: 'Request is not active', status: req.status }, 409);

  const fp = Array.isArray(req.from_pet) ? req.from_pet[0] : req.from_pet;
  const tp = Array.isArray(req.to_pet)   ? req.to_pet[0]   : req.to_pet;

  // Only pet owners can accept, decline, or counter a playdate request.
  // Caretakers may cancel/reschedule confirmed playdates but cannot negotiate new ones.
  const isFrom = req.from_owner_id === user.id;
  const isTo   = req.to_owner_id   === user.id;
  if (!isFrom && !isTo) return json({ error: 'Only the pet owner can respond to a playdate request' }, 403);

  const otherId  = isFrom ? req.to_owner_id   : req.from_owner_id;
  const myPet    = isFrom ? fp : tp;
  const otherPet = isFrom ? tp : fp;
  const myFirst  = await ownerFirst(db, user.id);
  const myLabel  = (emoji: string, name: string) => petLabel(myFirst, emoji, name);

  // ── accept ────────────────────────────────────────────────────────────────
  if (action === 'accept') {
    const pending = await getPendingProposal(db, request_id);
    if (!pending) return json({ error: 'No pending proposal to accept' }, 400);
    // Can't accept your own proposal
    if (pending.proposed_by_owner_id === user.id) {
      return json({ error: 'Cannot accept your own proposal' }, 400);
    }

    // CAS: mark proposal accepted
    const { data: claimed } = await db.from('playdate_proposals')
      .update({ status: 'accepted' })
      .eq('id', pending.id)
      .eq('status', 'pending')
      .select('id');
    if (!claimed?.length) return json({ error: 'Proposal already handled' }, 409);

    // Set request to accepted with agreed terms
    await db.from('playdate_requests').update({
      status:          'accepted',
      agreed_date:     pending.proposed_date,
      agreed_time:     pending.proposed_time,
      agreed_location: pending.proposed_location,
      responder_user_id: user.id,
    }).eq('id', request_id);

    // Upsert a playdate_chats row — update to agreed if negotiating chat already exists,
    // otherwise create fresh. Always include playdate_request_id so the chat screen can
    // join back to playdate_proposals and show pending counter-proposals.
    const existingChat = await db.from('playdate_chats')
      .select('id').eq('playdate_request_id', request_id).maybeSingle();
    let chatRow: { id: string } | null = null;
    if (existingChat.data?.id) {
      const { data: upd } = await db.from('playdate_chats')
        .update({ status: 'agreed', agreed_date: pending.proposed_date, agreed_time: pending.proposed_time, agreed_location: pending.proposed_location })
        .eq('id', existingChat.data.id).select('id').single();
      chatRow = upd;
    } else {
      const { data: ins, error: chatErr } = await db.from('playdate_chats').insert({
        playdate_request_id: request_id,
        from_owner_id:   req.from_owner_id,
        to_owner_id:     req.to_owner_id,
        from_pet_id:     req.from_pet_id,
        to_pet_id:       req.to_pet_id,
        status:          'agreed',
        agreed_date:     pending.proposed_date,
        agreed_time:     pending.proposed_time,
        agreed_location: pending.proposed_location,
      }).select('id').single();
      if (chatErr) console.error('[respond] ⚠️ could not create playdate_chats row:', chatErr.message);
      chatRow = ins;
    }

    const propSummary = fmtProposal(pending.proposed_date, pending.proposed_time, pending.proposed_location, (pending as any).proposed_end_time ?? null);
    await db.from('notification_logs').insert({
      user_id: otherId,
      title: `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} said YES! 🎉`,
      body:  propSummary,
      type:  'playdate_accepted',
      read:  false,
      data:  { request_id, chat_id: chatRow?.id ?? null, from_pet_id: req.from_pet_id, to_pet_id: req.to_pet_id, agreed_date: pending.proposed_date, agreed_time: pending.proposed_time, agreed_location: pending.proposed_location },
    });
    await push(db, otherId, `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} said YES! 🎉`, propSummary,
      { type: 'playdate_accepted', request_id, chat_id: chatRow?.id ?? null }, { color: '#14B8A6', badge: 1 });

    console.log(`[respond] ✅ accepted request_id=${request_id} chat_id=${chatRow?.id ?? 'none'}`);
    return json({ success: true, action: 'accepted', chat_id: chatRow?.id ?? null, agreed_date: pending.proposed_date, agreed_time: pending.proposed_time, agreed_location: pending.proposed_location });
  }

  // ── counter_propose ───────────────────────────────────────────────────────
  if (action === 'counter_propose') {
    const pending = await getPendingProposal(db, request_id);

    // Supersede the existing pending proposal if one exists
    if (pending) {
      await db.from('playdate_proposals')
        .update({ status: 'superseded' })
        .eq('id', pending.id)
        .eq('status', 'pending');
    }

    // What round are we on?
    const { data: lastProposal } = await db.from('playdate_proposals')
      .select('round')
      .eq('request_id', request_id)
      .order('round', { ascending: false })
      .limit(1)
      .single();
    const nextRound = ((lastProposal as any)?.round ?? 0) + 1;

    // Insert new proposal
    const myPetId = isFrom ? req.from_pet_id : req.to_pet_id;
    await db.from('playdate_proposals').insert({
      request_id,
      proposed_by_pet_id:   myPetId,
      proposed_by_owner_id: user.id,
      proposed_date,
      proposed_time,
      proposed_end_time: proposed_end_time ?? null,
      proposed_location,
      message: message ?? null,
      status: 'pending',
      round:  nextRound,
    });

    // Move request to scheduling (idempotent if already there) and keep the top-level
    // proposed_date/time/location in sync with the latest proposal — every screen (my-playdates,
    // the Connect tab) reads these columns directly rather than joining playdate_proposals,
    // so without this the UI would keep showing the original stale ask after a counter-propose.
    await db.from('playdate_requests').update({
      status:            'scheduling',
      responder_user_id: user.id,
      proposed_date,
      proposed_time,
      proposed_end_time: proposed_end_time ?? null,
      proposed_location,
    }).eq('id', request_id);

    const propSummary = fmtProposal(proposed_date, proposed_time, proposed_location, proposed_end_time ?? null);
    const oldSummary = pending
      ? fmtProposal(pending.proposed_date, pending.proposed_time, pending.proposed_location, (pending as any).proposed_end_time ?? null)
      : null;
    const body = oldSummary ? `Was: ${oldSummary}\nNow: ${propSummary}` : propSummary;
    await db.from('notification_logs').insert({
      user_id: otherId,
      title: `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} proposed a new time`,
      body,
      type:  'playdate_counter_proposal',
      read:  false,
      data:  {
        request_id, from_pet_id: req.from_pet_id, to_pet_id: req.to_pet_id,
        proposed_date, proposed_time, proposed_location, round: nextRound,
        old_date: pending?.proposed_date ?? null,
        old_time: pending?.proposed_time ?? null,
        old_location: pending?.proposed_location ?? null,
      },
    });
    await push(db, otherId, `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} proposed a new time`, body,
      { type: 'playdate_counter_proposal', request_id }, { color: '#FF8C55', badge: 1 });

    // Upsert a negotiating chat so both parties can navigate to the chat screen
    // and see the pending proposal banner with action buttons.
    const { data: existingNegChat } = await db.from('playdate_chats')
      .select('id').eq('playdate_request_id', request_id).maybeSingle();
    let negChatId: string | null = existingNegChat?.id ?? null;
    if (!negChatId) {
      const { data: negChat } = await db.from('playdate_chats').insert({
        playdate_request_id: request_id,
        from_owner_id: req.from_owner_id,
        to_owner_id:   req.to_owner_id,
        from_pet_id:   req.from_pet_id,
        to_pet_id:     req.to_pet_id,
        status:        'negotiating',
      }).select('id').single();
      negChatId = negChat?.id ?? null;
    }

    console.log(`[respond] ✅ counter_propose round=${nextRound} request_id=${request_id} chat_id=${negChatId}`);
    return json({ success: true, action: 'counter_propose', round: nextRound, chat_id: negChatId });
  }

  // ── decline ───────────────────────────────────────────────────────────────
  if (action === 'decline') {
    // CAS: only one caller wins the terminal transition
    const { data: claimed } = await db.from('playdate_requests')
      .update({ status: 'declined', responder_user_id: user.id })
      .eq('id', request_id)
      .in('status', ['pending', 'scheduling'])
      .select('id');
    if (!claimed?.length) return json({ error: 'Already handled' }, 409);

    // Mark the current pending proposal as declined
    const pending = await getPendingProposal(db, request_id);
    if (pending) {
      await db.from('playdate_proposals').update({ status: 'declined' }).eq('id', pending.id);
    }

    // Cancel any linked negotiating chat so both parties' carousels clear immediately
    await db.from('playdate_chats')
      .update({ status: 'declined' })
      .eq('playdate_request_id', request_id)
      .eq('status', 'negotiating');

    // Clear notification_dedup so the same pair can request again (different request_id dedup now,
    // but clean up legacy from_pet:to_pet keys just in case)
    await db.from('notification_dedup')
      .delete()
      .eq('notification_type', 'playdate_request')
      .eq('recipient_id', req.to_owner_id)
      .like('request_id', `%${req.from_pet_id}%`);

    // Notify the other party
    const notifTitle = isFrom
      ? `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} declined`
      : `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} can't make it`;
    const notifBody = isFrom
      ? 'They ended the negotiation.'
      : 'You can try again later.';
    await db.from('notification_logs').insert({
      user_id: otherId,
      title:  notifTitle,
      body:   notifBody,
      type:   'playdate_declined',
      read:   false,
      data:   { request_id, from_pet_id: req.from_pet_id, to_pet_id: req.to_pet_id },
    });
    await push(db, otherId, notifTitle, notifBody,
      { type: 'playdate_declined', request_id }, { color: '#9B8EBB', badge: 0 });

    // Auto-block check: B declined A's requests ≥ threshold times in 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { count: declineCount } = await db.from('playdate_requests')
      .select('id', { count: 'exact', head: true })
      .eq('from_pet_id', req.from_pet_id)
      .eq('to_pet_id',   req.to_pet_id)
      .eq('status',      'declined')
      .gte('created_at', thirtyDaysAgo);
    if ((declineCount ?? 0) >= AUTO_BLOCK_THRESHOLD) {
      await db.from('playdate_blocks').upsert({
        blocker_pet_id: req.to_pet_id,
        blocked_pet_id: req.from_pet_id,
        reason: 'auto_repeated_decline',
      }, { onConflict: 'blocker_pet_id,blocked_pet_id', ignoreDuplicates: true });
      console.log(`[respond] auto-blocked from_pet=${req.from_pet_id} by to_pet=${req.to_pet_id}`);
    }

    console.log(`[respond] ✅ declined request_id=${request_id}`);
    return json({ success: true, action: 'declined' });
  }

  return json({ error: 'Unknown respond_action' }, 400);
}

async function handleReschedule(db: ReturnType<typeof svc>, user: any, body: any) {
  const { request_id, proposed_date, proposed_time, proposed_end_time, proposed_location, message } = body;
  console.log(`[reschedule] request_id=${request_id} user=${user.id}`);

  if (!request_id || !proposed_date || !proposed_time) {
    return json({ error: 'request_id, proposed_date, and proposed_time required' }, 400);
  }

  const { data: req } = await db.from('playdate_requests')
    .select('id, status, from_pet_id, to_pet_id, from_owner_id, to_owner_id, from_pet:from_pet_id(name,emoji), to_pet:to_pet_id(name,emoji)')
    .eq('id', request_id).single();
  if (!req) return json({ error: 'Request not found' }, 404);
  if (req.status !== 'accepted') return json({ error: 'Can only reschedule an accepted playdate', status: req.status }, 409);

  let isFrom = req.from_owner_id === user.id;
  let isTo   = req.to_owner_id   === user.id;
  if (!isFrom && !isTo) {
    const [fromMember, toMember] = await Promise.all([
      isPetMember(db, req.from_pet_id, user.id),
      isPetMember(db, req.to_pet_id,   user.id),
    ]);
    isFrom = fromMember;
    isTo   = !fromMember && toMember;
  }
  if (!isFrom && !isTo) return json({ error: 'Unauthorized' }, 403);

  const otherId  = isFrom ? req.to_owner_id  : req.from_owner_id;
  const myPet    = isFrom ? (Array.isArray(req.from_pet) ? req.from_pet[0] : req.from_pet) : (Array.isArray(req.to_pet) ? req.to_pet[0] : req.to_pet);
  const myPetId  = isFrom ? req.from_pet_id : req.to_pet_id;
  const myFirst  = await ownerFirst(db, user.id);
  const myLabel  = (emoji: string, name: string) => petLabel(myFirst, emoji, name);

  // Supersede any pending proposal (shouldn't normally exist on accepted, but be safe)
  const pending = await getPendingProposal(db, request_id);
  if (pending) {
    await db.from('playdate_proposals').update({ status: 'superseded' }).eq('id', pending.id);
  }

  const { data: lastProposal } = await db.from('playdate_proposals')
    .select('round').eq('request_id', request_id).order('round', { ascending: false }).limit(1).single();
  const nextRound = ((lastProposal as any)?.round ?? 0) + 1;

  await db.from('playdate_proposals').insert({
    request_id,
    proposed_by_pet_id:   myPetId,
    proposed_by_owner_id: user.id,
    proposed_date,
    proposed_time,
    proposed_end_time: proposed_end_time ?? null,
    proposed_location,
    message: message ?? null,
    status: 'pending',
    round:  nextRound,
  });

  // Back to scheduling; sync proposed fields so NearbyPetCard shows the new date;
  // reset reminder flags so they fire again for the new agreed date once accepted.
  await db.from('playdate_requests').update({
    status:              'scheduling',
    proposed_date,
    proposed_time,
    proposed_end_time:   proposed_end_time ?? null,
    proposed_location:   proposed_location ?? null,
    reminder_1day_sent:  false,
    reminder_3hour_sent: false,
    responder_user_id:   user.id,
  }).eq('id', request_id);

  // Revert the linked chat back to negotiating so the chat screen no longer shows
  // "PLAYDATE CONFIRMED" for a date that is now under re-negotiation.
  const { data: chatLink } = await db.from('playdate_chats')
    .select('id')
    .eq('playdate_request_id', request_id)
    .eq('status', 'agreed')
    .limit(1)
    .single()
    .then((r: any) => r);
  if (chatLink?.id) {
    await db.from('playdate_chats')
      .update({ status: 'negotiating' })
      .eq('id', chatLink.id)
      .eq('status', 'agreed');
  }

  const propSummary = fmtProposal(proposed_date, proposed_time, proposed_location, proposed_end_time ?? null);
  await db.from('notification_logs').insert({
    user_id: otherId,
    title: `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} wants to reschedule`,
    body:  propSummary,
    type:  'playdate_rescheduled',
    read:  false,
    data:  { request_id, proposed_date, proposed_time, proposed_location, round: nextRound },
  });
  await push(db, otherId, `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} wants to reschedule`, propSummary,
    { type: 'playdate_rescheduled', request_id }, { color: '#FF8C55', badge: 1 });

  console.log(`[reschedule] ✅ request_id=${request_id} round=${nextRound}`);
  return json({ success: true, round: nextRound });
}

async function handleCancel(db: ReturnType<typeof svc>, user: any, body: any) {
  const { request_id, reason } = body;
  console.log(`[cancel] request_id=${request_id} user=${user.id}`);
  if (!request_id) return json({ error: 'request_id required' }, 400);

  const { data: req } = await db.from('playdate_requests')
    .select('id, status, from_pet_id, to_pet_id, from_owner_id, to_owner_id, agreed_date, agreed_time, agreed_location, from_pet:from_pet_id(name,emoji), to_pet:to_pet_id(name,emoji)')
    .eq('id', request_id).single();
  if (!req) return json({ error: 'Request not found' }, 404);
  if (!['accepted', 'scheduling'].includes(req.status)) {
    return json({ error: 'Can only cancel an accepted or scheduling playdate', status: req.status }, 409);
  }

  let isFrom = req.from_owner_id === user.id;
  let isTo   = req.to_owner_id   === user.id;
  if (!isFrom && !isTo) {
    const [fromMember, toMember] = await Promise.all([
      isPetMember(db, req.from_pet_id, user.id),
      isPetMember(db, req.to_pet_id,   user.id),
    ]);
    isFrom = fromMember;
    isTo   = !fromMember && toMember;
  }
  if (!isFrom && !isTo) return json({ error: 'Unauthorized' }, 403);

  // CAS: prevent double-cancel
  const { data: claimed } = await db.from('playdate_requests')
    .update({ status: 'cancelled', responder_user_id: user.id, cancel_reason: reason ?? null })
    .eq('id', request_id)
    .in('status', ['accepted', 'scheduling'])
    .select('id');
  if (!claimed?.length) return json({ error: 'Already cancelled' }, 409);

  // Clean up any pending proposal
  const pending = await getPendingProposal(db, request_id);
  if (pending) {
    await db.from('playdate_proposals').update({ status: 'declined' }).eq('id', pending.id);
  }

  const otherId = isFrom ? req.to_owner_id  : req.from_owner_id;
  const myPet   = isFrom ? (Array.isArray(req.from_pet) ? req.from_pet[0] : req.from_pet)
                         : (Array.isArray(req.to_pet)   ? req.to_pet[0]   : req.to_pet);
  const myFirst = await ownerFirst(db, user.id);
  const myLabel = (emoji: string, name: string) => petLabel(myFirst, emoji, name);

  const dateSummary = req.agreed_date
    ? fmtProposal(req.agreed_date, req.agreed_time, req.agreed_location)
    : null;
  const cancelBody = [dateSummary, reason ? `Reason: ${reason}` : null]
    .filter(Boolean).join('\n') || 'The playdate has been cancelled.';

  await db.from('notification_logs').insert({
    user_id: otherId,
    title: `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} cancelled the playdate`,
    body:  cancelBody,
    type:  'playdate_cancelled',
    read:  false,
    data:  { request_id, from_pet_id: req.from_pet_id, to_pet_id: req.to_pet_id, reason: reason ?? null },
  });
  await push(db, otherId, `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} cancelled the playdate`, cancelBody,
    { type: 'playdate_cancelled', request_id }, { color: '#E24B4A', badge: 1 });

  console.log(`[cancel] ✅ request_id=${request_id}`);
  return json({ success: true });
}

async function handleWithdraw(db: ReturnType<typeof svc>, user: any, body: any) {
  const { request_id } = body;
  console.log(`[withdraw] request_id=${request_id} user=${user.id}`);
  if (!request_id) return json({ error: 'request_id required' }, 400);

  const { data: req } = await db.from('playdate_requests')
    .select('id, status, from_pet_id, to_pet_id, from_owner_id, to_owner_id, from_pet:from_pet_id(name,emoji), to_pet:to_pet_id(name,emoji)')
    .eq('id', request_id).single();
  if (!req) return json({ error: 'Request not found' }, 404);
  if (!['pending', 'scheduling'].includes(req.status)) {
    return json({ error: 'Can only withdraw a pending or scheduling request', status: req.status }, 409);
  }
  // Only the requester (from) side may withdraw
  const fromSide = req.from_owner_id === user.id || await isPetMember(db, req.from_pet_id, user.id);
  if (!fromSide) return json({ error: 'Only the requester can withdraw' }, 403);

  const { data: claimed } = await db.from('playdate_requests')
    .update({ status: 'withdrawn', responder_user_id: user.id })
    .eq('id', request_id)
    .in('status', ['pending', 'scheduling'])
    .select('id');
  if (!claimed?.length) return json({ error: 'Already handled' }, 409);

  const pending = await getPendingProposal(db, request_id);
  if (pending) {
    await db.from('playdate_proposals').update({ status: 'declined' }).eq('id', pending.id);
  }

  const myPet   = Array.isArray(req.from_pet) ? req.from_pet[0] : req.from_pet;
  const myFirst = await ownerFirst(db, user.id);
  const myLabel = (emoji: string, name: string) => petLabel(myFirst, emoji, name);
  await db.from('notification_logs').insert({
    user_id: req.to_owner_id,
    title: `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} withdrew the request`,
    body:  'The playdate request was cancelled.',
    type:  'playdate_withdrawal',
    read:  false,
    data:  { request_id, from_pet_id: req.from_pet_id, to_pet_id: req.to_pet_id },
  });
  await push(db, req.to_owner_id, `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} withdrew the request`, 'The playdate request was cancelled.',
    { type: 'playdate_withdrawal', request_id }, { color: '#9B8EBB', badge: 0 });

  // Clean up any lingering negotiating chat so the to-side doesn't see a stale scheduling card
  await db.from('playdate_chats')
    .update({ status: 'declined' })
    .eq('playdate_request_id', request_id)
    .eq('status', 'negotiating');

  console.log(`[withdraw] ✅ request_id=${request_id}`);
  return json({ success: true });
}

async function handleResend(db: ReturnType<typeof svc>, user: any, body: any) {
  const { request_id } = body;
  console.log(`[resend] request_id=${request_id} user=${user.id}`);
  if (!request_id) return json({ error: 'request_id required' }, 400);

  const { data: req } = await db.from('playdate_requests')
    .select('id, status, from_pet_id, to_pet_id, from_owner_id, to_owner_id, from_pet:from_pet_id(name,emoji), to_pet:to_pet_id(name,emoji)')
    .eq('id', request_id).single();
  if (!req) return json({ error: 'Request not found' }, 404);
  if (req.status !== 'pending') {
    return json({ error: 'Can only resend a pending request', status: req.status }, 409);
  }
  // Only the requester (from) side may resend
  const fromSide = req.from_owner_id === user.id || await isPetMember(db, req.from_pet_id, user.id);
  if (!fromSide) return json({ error: 'Only the requester can resend' }, 403);

  const myPet   = Array.isArray(req.from_pet) ? req.from_pet[0] : req.from_pet;
  const myFirst = await ownerFirst(db, user.id);
  const myLabel = (emoji: string, name: string) => petLabel(myFirst, emoji, name);
  await db.from('notification_logs').upsert({
    user_id: req.to_owner_id,
    title: `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} is still waiting`,
    body:  'They sent a playdate request and are hoping to hear back.',
    type:  'playdate_resend',
    read:  false,
    dedup_key: `playdate_resend:${request_id}`,
    data:  { request_id, from_pet_id: req.from_pet_id, to_pet_id: req.to_pet_id },
  }, { onConflict: 'user_id,dedup_key' });
  await push(db, req.to_owner_id, `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} is still waiting`, 'They sent a playdate request and are hoping to hear back.',
    { type: 'playdate_resend', request_id }, { color: '#FF8C55', badge: 1 });

  console.log(`[resend] ✅ request_id=${request_id}`);
  return json({ success: true });
}

async function handleComplete(db: ReturnType<typeof svc>, user: any, body: any) {
  const { request_id } = body;
  console.log(`[complete] request_id=${request_id} user=${user.id}`);
  if (!request_id) return json({ error: 'request_id required' }, 400);

  const { data: req } = await db.from('playdate_requests')
    .select('id, status, from_pet_id, to_pet_id, from_owner_id, to_owner_id, from_confirmed, to_confirmed, from_pet:from_pet_id(name,emoji), to_pet:to_pet_id(name,emoji)')
    .eq('id', request_id).single();
  if (!req) return json({ error: 'Request not found' }, 404);
  if (req.status !== 'accepted') return json({ error: 'Can only confirm an accepted playdate' }, 409);

  const isFrom = req.from_owner_id === user.id || await isPetMember(db, (req as any).from_pet_id, user.id);
  const isTo   = !isFrom && (req.to_owner_id === user.id || await isPetMember(db, (req as any).to_pet_id, user.id));
  if (!isFrom && !isTo) return json({ error: 'Unauthorized' }, 403);
  const myFirst = await ownerFirst(db, user.id);
  const myLabel = (emoji: string, name: string) => petLabel(myFirst, emoji, name);

  const update: Record<string, unknown> = isFrom ? { from_confirmed: true } : { to_confirmed: true };
  const bothConfirmed = isFrom ? req.to_confirmed : req.from_confirmed;
  if (bothConfirmed) {
    update.status       = 'completed';
    update.completed_at = new Date().toISOString();
  }
  await db.from('playdate_requests').update(update).eq('id', request_id);

  if (bothConfirmed) {
    const otherId = isFrom ? req.to_owner_id : req.from_owner_id;
    const myPet   = isFrom ? (Array.isArray(req.from_pet) ? req.from_pet[0] : req.from_pet)
                           : (Array.isArray(req.to_pet)   ? req.to_pet[0]   : req.to_pet);
    await db.from('notification_logs').insert({
      user_id: otherId,
      title: `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} confirmed the playdate!`,
      body:  'You both confirmed — hope it was a great time! 🐾',
      type:  'playdate_completion',
      read:  false,
      data:  { request_id },
    });
    await push(db, otherId, `${myLabel(myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet')} confirmed the playdate!`, 'Hope it was a great time! 🐾',
      { type: 'playdate_completion', request_id }, { color: '#14B8A6', badge: 1 });
  }

  console.log(`[complete] ✅ request_id=${request_id} both_confirmed=${bothConfirmed}`);
  return json({ success: true, completed: !!bothConfirmed });
}

async function handleBlock(db: ReturnType<typeof svc>, user: any, body: any) {
  const { blocker_pet_id, blocked_pet_id } = body;
  console.log(`[block] blocker=${blocker_pet_id} blocked=${blocked_pet_id} user=${user.id}`);
  if (!blocker_pet_id || !blocked_pet_id) return json({ error: 'blocker_pet_id and blocked_pet_id required' }, 400);
  if (!(await isPetMember(db, blocker_pet_id, user.id))) return json({ error: 'Unauthorized' }, 403);

  await db.from('playdate_blocks').upsert({
    blocker_pet_id,
    blocked_pet_id,
    reason: 'manual',
  }, { onConflict: 'blocker_pet_id,blocked_pet_id', ignoreDuplicates: true });

  return json({ success: true });
}

const PUSH_TYPE_TO_FLAG: Record<string, string> = {
  post_like:                 'notif_family',
  post_comment:              'notif_family',
  post_comment_reply:        'notif_family',
  follow:                    'notif_family',
  mention:                   'notif_family',
  playdate_request:            'notif_playdate',
  playdate_resend:             'notif_playdate',
  playdate_confirmed:          'notif_playdate',
  playdate_accepted:           'notif_playdate',
  playdate_declined:           'notif_playdate',
  playdate_reminder:           'notif_playdate',
  playdate_withdrawal:         'notif_playdate',
  playdate_proposal:           'notif_playdate',
  playdate_counter_proposal:   'notif_playdate',
  playdate_cancelled:          'notif_playdate',
  playdate_rescheduled:        'notif_playdate',
  playdate_completion:         'notif_playdate',
  playdate_expired:            'notif_playdate',
  playdate_proposal_declined:  'notif_playdate',
  playdate_proposal_cancelled: 'notif_playdate',
  chat_message:                'notif_chat',
  playdate_message:            'notif_chat',
  playdate_chat_message:       'notif_chat',
  event_rsvp:                'notif_event',
  event_update:              'notif_event',
  invite:                    'notif_family',
  family_invite:             'notif_family',
  appointment_reminder:      'notif_appointment',
  lost_alert:                'notif_lost',
  found_pet:                 'notif_lost',
  health_alert:              'notif_health',
  medication_reminder:       'notif_health',
  new_post:                  'notif_family',
  daily_tip:                 'notif_daily',
  daily_care:                'notif_daily',
};

// Writes a notification_logs row for another user (bypasses client RLS) + optional push
async function handleNotify(db: ReturnType<typeof svc>, user: { id: string }, body: any) {
  const { user_id, title, body: notifBody, type, data, dedup_key } = body;
  if (!user_id || !title || !type) return json({ error: 'user_id, title, type required' }, 400);

  // Block self-notifications unconditionally
  if (user_id === user.id) {
    console.log(`[handleNotify] blocked self-notification type=${type} actor=${user.id}`);
    return json({ ok: true, skipped: 'self' });
  }

  // For playdate notification types, verify caller is actually a participant on this request
  const requestId: string | undefined = data?.request_id;
  if (type?.startsWith('playdate') && requestId) {
    const { data: req } = await db.from('playdate_requests')
      .select('from_owner_id, to_owner_id')
      .eq('id', requestId)
      .single();
    if (!req) return json({ error: 'Request not found' }, 404);
    const isParticipant = req.from_owner_id === user.id || req.to_owner_id === user.id;
    const isRecipient   = req.from_owner_id === user_id || req.to_owner_id === user_id;
    if (!isParticipant || !isRecipient) {
      console.warn(`[handleNotify] blocked: actor=${user.id} is not participant on request=${requestId}`);
      return json({ error: 'Forbidden' }, 403);
    }
  }

  // For comment/reply notifications, verify caller is a commenter or author on that post
  // and that the target is not the actor themselves
  const postId: string | undefined = data?.post_id;
  if ((type === 'post_comment' || type === 'post_comment_reply') && postId) {
    // Verify actor has actually commented on or authored this post
    const [{ data: postRow }, { data: commentRow }] = await Promise.all([
      db.from('social_posts').select('author_id').eq('id', postId).single(),
      db.from('post_comments').select('id').eq('post_id', postId).eq('author_id', user.id).limit(1).maybeSingle(),
    ]);
    const actorIsAuthorOrCommenter = postRow?.author_id === user.id || !!commentRow;
    if (!actorIsAuthorOrCommenter) {
      console.warn(`[handleNotify] blocked comment notif: actor=${user.id} has no relation to post=${postId}`);
      return json({ error: 'Forbidden' }, 403);
    }
    // Verify target is the post author or a commenter — not some random user
    const { data: targetRelation } = await db.from('post_comments')
      .select('id').eq('post_id', postId).eq('author_id', user_id).limit(1).maybeSingle();
    const targetIsAuthorOrCommenter = postRow?.author_id === user_id || !!targetRelation;
    if (!targetIsAuthorOrCommenter) {
      console.warn(`[handleNotify] blocked comment notif: target=${user_id} has no relation to post=${postId}`);
      return json({ error: 'Forbidden' }, 403);
    }
  }

  const row: Record<string, any> = { user_id, title, body: notifBody ?? null, type, data: data ?? {}, read: false };
  console.log(`[handleNotify] inserting ${type} for user ${user_id}, dedup_key=${dedup_key}`);

  // For dedup'd notifications (likes, follows, chats): check if an unread row already
  // exists before upserting. If it does the user already has a pending push — skip the
  // push this time so rapid like/unlike/like doesn't send a second banner.
  let skipPush = false;
  if (dedup_key) {
    const { data: existing } = await db.from('notification_logs')
      .select('id, read')
      .eq('user_id', user_id)
      .eq('dedup_key', dedup_key)
      .maybeSingle();
    if (existing && !existing.read) skipPush = true; // unread row exists — upsert refreshes it, but skip duplicate push

    const { error: err } = await db.from('notification_logs')
      .upsert({ ...row, dedup_key }, { onConflict: 'user_id,dedup_key' });
    if (err) {
      console.error(`[handleNotify] upsert failed:`, err);
      return json({ error: err.message }, 500);
    }
  } else {
    const { error: err } = await db.from('notification_logs').insert(row);
    if (err) {
      console.error(`[handleNotify] insert failed:`, err);
      return json({ error: err.message }, 500);
    }
  }
  console.log(`[handleNotify] ✅ notification inserted for type=${type}, user=${user_id}, skipPush=${skipPush}`);

  // Also send push if there's a token — but skip if the dedup row already existed
  // (user already received a push for this action; avoid stacking duplicate banners)
  if (skipPush) return json({ success: true, pushed: false });
  const notifType: string | undefined = data?.type ?? type;
  const flag = notifType ? PUSH_TYPE_TO_FLAG[notifType] : undefined;
  // flag=undefined means type not in PUSH_TYPE_TO_FLAG — skip push rather than bypass prefs
  if (flag && (await canNotify(db, user_id, flag))) {
    const tokens = await getTokens(db, user_id);
    if (tokens.length) {
      const msgs = tokens.map((to: string) => ({
        to, sound: 'default', title, body: notifBody ?? '', data: data || {},
        priority: 'high', channelId: 'social',
        android: { color: '#7C5CBF', colorized: true, priority: 'high' },
        ios: { sound: true, badge: 1, interruptionLevel: 'timeSensitive' },
      }));
      await fetch(EXPO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(msgs) });
    }
  }
  return json({ success: true });
}

async function handlePush(db: ReturnType<typeof svc>, body: any) {
  const { user_id, title, body: pushBody, data } = body;
  if (!user_id || !title || !pushBody) return json({ error: 'user_id, title, body required' }, 400);

  // Enforce recipient notification preferences before sending
  const notifType: string | undefined = data?.type;
  const flag = notifType ? PUSH_TYPE_TO_FLAG[notifType] : undefined;
  if (flag && !(await canNotify(db, user_id, flag))) {
    return json({ success: true, notified: 0, blocked: true });
  }

  const tokens = await getTokens(db, user_id);
  if (!tokens.length) return json({ success: true, notified: 0 });
  const msgs = tokens.map((to: string) => ({
    to, sound: 'default', title, body: pushBody, data: data || {},
    priority: 'high', channelId: 'social',
    android: { color: '#FF8C55', colorized: true, priority: 'high' },
    ios: { sound: true, badge: 1, interruptionLevel: 'timeSensitive' },
  }));
  await fetch(EXPO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(msgs) });
  return json({ success: true, notified: tokens.length });
}

async function handleReminders(db: ReturnType<typeof svc>) {
  // Check feature flag — skip everything if playdates are disabled
  const { data: flagRow } = await db.from('app_settings')
    .select('value').eq('key', 'connect_playdates_enabled').single();
  if (flagRow?.value === false) {
    console.log('[reminders] feature disabled — skipping');
    return json({ success: true, skipped: true });
  }

  let expired = 0, sent = 0;

  // ── 1. Expire pending/scheduling requests past their expiry ─────────────────
  const { data: stale } = await db.from('playdate_requests')
    .select('id, status, from_owner_id, to_owner_id, from_pet:from_pet_id(name,emoji), to_pet:to_pet_id(name,emoji)')
    .in('status', ['pending', 'scheduling'])
    .lt('expires_at', new Date().toISOString());

  for (const req of stale ?? []) {
    // CAS: another cron invocation may have already handled it
    const { data: claimed } = await db.from('playdate_requests')
      .update({ status: 'expired' })
      .eq('id', req.id)
      .eq('status', req.status)
      .select('id');
    if (!claimed?.length) continue;

    const fp = Array.isArray(req.from_pet) ? req.from_pet[0] : req.from_pet;
    const tp = Array.isArray(req.to_pet)   ? req.to_pet[0]   : req.to_pet;

    // Notify both parties
    await db.from('notification_logs').insert([
      {
        user_id: req.to_owner_id,
        title: `${fp?.emoji} ${fp?.name}'s request expired`,
        body: 'The request was never responded to — it has been removed.',
        type: 'playdate_expired', read: false,
        data: { request_id: req.id },
      },
      {
        user_id: req.from_owner_id,
        title: `Your request to ${tp?.emoji} ${tp?.name} expired`,
        body: 'They may be busy — feel free to try again later.',
        type: 'playdate_expired', read: false,
        data: { request_id: req.id },
      },
    ]);

    await Promise.all([
      push(db, req.to_owner_id,   `${fp?.emoji} ${fp?.name}'s request expired`, 'No response — request removed.', { type: 'playdate_expired', request_id: req.id }, { badge: 0 }),
      push(db, req.from_owner_id, `Your request to ${tp?.emoji} ${tp?.name} expired`, 'Feel free to try again.', { type: 'playdate_expired', request_id: req.id }, { badge: 0 }),
    ]);
    expired++;
  }

  // ── 2. Reminder pushes for accepted playdates ─────────────────────────────
  const now      = new Date();
  // Widen to ±1 day so timezone shifts (e.g. IST UTC+5:30) never cause a miss
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
  const tomorrow  = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
  const today     = now.toISOString().split('T')[0];

  // Fetch owner timezones so we can check dates/times in their local time
  const { data: upcoming } = await db.from('playdate_requests')
    .select('id, agreed_date, agreed_time, agreed_location, from_owner_id, to_owner_id, reminder_1day_sent, reminder_3hour_sent, from_pet:from_pet_id(name,emoji), to_pet:to_pet_id(name,emoji)')
    .eq('status', 'accepted')
    .in('agreed_date', [yesterday, today, tomorrow]);

  // Collect all owner ids and fetch their timezones once
  const ownerIds = [...new Set((upcoming ?? []).flatMap((r: any) => [r.from_owner_id, r.to_owner_id]))];
  const { data: tzRows } = ownerIds.length
    ? await db.from('profiles').select('id, timezone').in('id', ownerIds)
    : { data: [] };
  const ownerTzMap = new Map<string, string | null>((tzRows ?? []).map((r: any) => [r.id, r.timezone ?? null]));

  /** Local date string (YYYY-MM-DD) for a user in their stored timezone. */
  function localDate(userId: string, offset = 0): string {
    const tz = ownerTzMap.get(userId) ?? 'UTC';
    const d  = new Date(now.getTime() + offset);
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch { return d.toISOString().split('T')[0]; }
  }

  for (const req of upcoming ?? []) {
    const fp = Array.isArray(req.from_pet) ? req.from_pet[0] : req.from_pet;
    const tp = Array.isArray(req.to_pet)   ? req.to_pet[0]   : req.to_pet;
    if (!fp || !tp) continue;

    const timeStr = req.agreed_time ? ` at ${(req.agreed_time as string).substring(0, 5)}` : '';
    const locStr  = req.agreed_location ? ` · ${req.agreed_location}` : '';
    const body    = `${req.agreed_date}${timeStr}${locStr}`;

    // 1-day reminder: fire when agreed_date == tomorrow in EITHER owner's timezone
    const fromTomorrow = localDate(req.from_owner_id, 86400000);
    const toTomorrow   = localDate(req.to_owner_id,   86400000);
    if ((req.agreed_date === fromTomorrow || req.agreed_date === toTomorrow) && !req.reminder_1day_sent) {
      const { data: claimed } = await db.from('playdate_requests')
        .update({ reminder_1day_sent: true })
        .eq('id', req.id).eq('reminder_1day_sent', false)
        .select('id');
      if (!claimed?.length) continue;
      for (const { userId, otherPet } of [{ userId: req.from_owner_id, otherPet: tp }, { userId: req.to_owner_id, otherPet: fp }]) {
        const title = `${otherPet.emoji} Playdate tomorrow!`;
        await db.from('notification_logs').insert({ user_id: userId, title, body, type: 'playdate_reminder', read: false, data: { request_id: req.id } });
        await push(db, userId, title, body, { type: 'playdate_reminder', request_id: req.id }, { color: '#14B8A6' });
      }
      sent++;
    }

    // 3-hour reminder: fire when agreed_date == today in EITHER owner's timezone
    // and agreed_time is 0–3h away in UTC (agreed_time stored as local HH:MM —
    // build a UTC timestamp by parsing it against the date string as if local)
    const fromToday = localDate(req.from_owner_id);
    const toToday   = localDate(req.to_owner_id);
    if ((req.agreed_date === fromToday || req.agreed_date === toToday) && !req.reminder_3hour_sent) {
      let inWindow = true;
      if (req.agreed_time) {
        // Parse agreed_time as UTC (stored without offset — treat as UTC wall clock)
        const [hh, mm] = (req.agreed_time as string).split(':').map(Number);
        const meetMs = Date.UTC(
          now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0
        );
        const mins = (meetMs - now.getTime()) / 60000;
        inWindow   = mins > 0 && mins <= 180;
      }
      if (inWindow) {
        const { data: claimed } = await db.from('playdate_requests')
          .update({ reminder_3hour_sent: true })
          .eq('id', req.id).eq('reminder_3hour_sent', false)
          .select('id');
        if (!claimed?.length) continue;
        for (const { userId, otherPet } of [{ userId: req.from_owner_id, otherPet: tp }, { userId: req.to_owner_id, otherPet: fp }]) {
          const title = `${otherPet.emoji} Playdate in 3 hours!`;
          await db.from('notification_logs').insert({ user_id: userId, title, body, type: 'playdate_reminder', read: false, data: { request_id: req.id } });
          await push(db, userId, title, body, { type: 'playdate_reminder', request_id: req.id }, { color: '#14B8A6' });
        }
        sent++;
      }
    }
  }

  console.log(`[reminders] expired=${expired} reminders_sent=${sent}`);
  return json({ success: true, expired, reminders_sent: sent });
}

// ─── chat actions ─────────────────────────────────────────────────────────────

// Fetch both pets for a chat (needed for notification copy in chat actions).
async function chatPets(db: ReturnType<typeof svc>, chat: any) {
  const [{ data: fp }, { data: tp }] = await Promise.all([
    db.from('pets').select('id, name, emoji, owner_id').eq('id', chat.from_pet_id).single(),
    db.from('pets').select('id, name, emoji, owner_id').eq('id', chat.to_pet_id).single(),
  ]);
  return {
    fromPet: (fp ?? null) as { id: string; name: string; emoji: string; owner_id: string } | null,
    toPet:   (tp ?? null) as { id: string; name: string; emoji: string; owner_id: string } | null,
  };
}

async function handleChatSend(db: ReturnType<typeof svc>, user: any, body: any) {
  const { chat_id, content, message_action, proposed_date, proposed_time, proposed_end_time, proposed_location } = body;
  if (!chat_id || !content) return json({ error: 'chat_id and content required' }, 400);

  const { data: chat } = await db.from('playdate_chats')
    .select('id, status, from_owner_id, to_owner_id, from_pet_id, to_pet_id')
    .eq('id', chat_id).single();
  if (!chat) return json({ error: 'Chat not found' }, 404);
  if (chat.from_owner_id !== user.id && chat.to_owner_id !== user.id) return json({ error: 'Unauthorized' }, 403);
  if (chat.status === 'cancelled' || chat.status === 'declined') return json({ error: 'Chat is closed' }, 409);

  const isProposal = message_action === 'propose';

  // Supersede any existing pending proposal when sending a new one
  if (isProposal) {
    await db.from('playdate_chat_messages')
      .update({ proposal_status: 'superseded' })
      .eq('chat_id', chat_id)
      .eq('message_type', 'proposal')
      .eq('proposal_status', 'pending');
  }

  const { error } = await db.from('playdate_chat_messages').insert({
    chat_id,
    sender_id:    user.id,
    message_type: isProposal ? 'proposal' : 'text',
    content,
    ...(isProposal ? {
      proposed_date,
      proposed_time,
      proposed_location: proposed_location ?? null,
      proposal_status:   'pending',
    } : {}),
  });
  if (error) return json({ error: error.message }, 500);

  // Notify the other party
  const otherId = user.id === chat.from_owner_id ? chat.to_owner_id : chat.from_owner_id;
  const { fromPet, toPet } = await chatPets(db, chat);
  const myPet    = user.id === chat.from_owner_id ? fromPet : toPet;
  const chatFirst = await ownerFirst(db, user.id);
  const chatLabel = petLabel(chatFirst, myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet');
  const notifType = isProposal ? 'playdate_counter_proposal' : 'playdate_chat_message';
  const notifTitle = isProposal
    ? `${chatLabel} proposed a new time`
    : `${chatLabel}: ${content.substring(0, 60)}`;
  const notifBody = isProposal
    ? fmtProposal(proposed_date, proposed_time, proposed_location, proposed_end_time ?? null)
    : content.substring(0, 120);
  await db.from('notification_logs').insert({
    user_id: otherId, title: notifTitle, body: notifBody,
    type: notifType, read: false, data: { chat_id },
  });
  await push(db, otherId, notifTitle, notifBody, { type: notifType, chat_id }, { color: '#7C5CBF', flag: 'notif_chat' });

  return json({ success: true });
}

async function handleProposalRespond(db: ReturnType<typeof svc>, user: any, body: any) {
  const { message_id, response } = body; // response: 'accept' | 'reject'
  if (!message_id || !['accept', 'reject'].includes(response)) {
    return json({ error: 'message_id and response (accept|reject) required' }, 400);
  }

  const { data: msg } = await db.from('playdate_chat_messages')
    .select('id, chat_id, sender_id, message_type, proposal_status, proposed_date, proposed_time, proposed_location')
    .eq('id', message_id).single();
  if (!msg) return json({ error: 'Message not found' }, 404);
  if (msg.message_type !== 'proposal') return json({ error: 'Not a proposal message' }, 400);
  if (msg.proposal_status !== 'pending') return json({ error: 'Proposal is not pending' }, 409);
  if (msg.sender_id === user.id) return json({ error: 'Cannot respond to your own proposal' }, 400);

  const { data: chat } = await db.from('playdate_chats')
    .select('id, status, from_owner_id, to_owner_id, from_pet_id, to_pet_id')
    .eq('id', msg.chat_id).single();
  if (!chat) return json({ error: 'Chat not found' }, 404);
  if (chat.from_owner_id !== user.id && chat.to_owner_id !== user.id) return json({ error: 'Unauthorized' }, 403);

  await db.from('playdate_chat_messages')
    .update({ proposal_status: response === 'accept' ? 'accept' : 'reject' })
    .eq('id', message_id);

  const { fromPet, toPet } = await chatPets(db, chat);
  const myPet     = user.id === chat.from_owner_id ? fromPet : toPet;
  const proposer  = msg.sender_id;
  const respFirst = await ownerFirst(db, user.id);
  const respLabel = petLabel(respFirst, myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet');

  if (response === 'accept') {
    await db.from('playdate_chats').update({
      status:          'agreed',
      agreed_date:     msg.proposed_date,
      agreed_time:     msg.proposed_time,
      agreed_location: msg.proposed_location,
    }).eq('id', msg.chat_id);

    await db.from('playdate_chat_messages').insert({
      chat_id:      msg.chat_id,
      sender_id:    user.id,
      message_type: 'system',
      content:      '🎉 Playdate confirmed!',
    });

    // Keep playdate_requests in sync — update the linked request to 'accepted' with agreed details
    // so reminders and history queries work correctly for chat-flow confirmations.
    const { data: chatRow } = await db.from('playdate_chats')
      .select('playdate_request_id').eq('id', msg.chat_id).single();
    if (chatRow?.playdate_request_id) {
      await db.from('playdate_requests').update({
        status:          'accepted',
        agreed_date:     msg.proposed_date,
        agreed_time:     msg.proposed_time,
        agreed_location: msg.proposed_location,
      }).eq('id', chatRow.playdate_request_id).in('status', ['pending', 'scheduling', 'negotiating']);
    }

    // Notify the proposer their proposal was accepted
    const confirmTitle = `${respLabel} confirmed the playdate! 🎉`;
    const confirmBody  = fmtProposal(msg.proposed_date, msg.proposed_time, msg.proposed_location, (msg as any).proposed_end_time ?? null);
    await db.from('notification_logs').insert({
      user_id: proposer, title: confirmTitle, body: confirmBody,
      type: 'playdate_accepted', read: false, data: { chat_id: msg.chat_id },
    });
    await push(db, proposer, confirmTitle, confirmBody, { type: 'playdate_accepted', chat_id: msg.chat_id }, { color: '#22C55E' });
  } else {
    // Notify the proposer their proposal was declined / counter will come
    const rejectTitle = `${respLabel} proposed a new time`;
    const rejectBody  = 'They want to try a different date — check the chat.';
    await db.from('notification_logs').insert({
      user_id: proposer, title: rejectTitle, body: rejectBody,
      type: 'playdate_counter_proposal', read: false, data: { chat_id: msg.chat_id },
    });
    await push(db, proposer, rejectTitle, rejectBody, { type: 'playdate_counter_proposal', chat_id: msg.chat_id }, { color: '#7C5CBF', flag: 'notif_chat' });
  }

  return json({ success: true, response });
}

async function handleProposalCancel(db: ReturnType<typeof svc>, user: any, body: any) {
  const { message_id } = body;
  if (!message_id) return json({ error: 'message_id required' }, 400);

  const { data: msg } = await db.from('playdate_chat_messages')
    .select('id, chat_id, sender_id, proposal_status')
    .eq('id', message_id).single();
  if (!msg) return json({ error: 'Message not found' }, 404);
  if (msg.sender_id !== user.id) return json({ error: 'Can only cancel your own proposal' }, 403);
  if (msg.proposal_status !== 'pending') return json({ error: 'Proposal is not pending' }, 409);

  await db.from('playdate_chat_messages')
    .update({ proposal_status: 'cancelled' })
    .eq('id', message_id);

  // Notify the other party the proposal was withdrawn
  const { data: chat } = await db.from('playdate_chats')
    .select('id, from_owner_id, to_owner_id, from_pet_id, to_pet_id')
    .eq('id', msg.chat_id).single();
  if (chat) {
    const otherId = user.id === chat.from_owner_id ? chat.to_owner_id : chat.from_owner_id;
    const { fromPet, toPet } = await chatPets(db, chat);
    const myPet      = user.id === chat.from_owner_id ? fromPet : toPet;
    const cancelFirst = await ownerFirst(db, user.id);
    const title = petLabel(cancelFirst, myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet') + ' cancelled their proposal';
    const body  = 'They withdrew their time suggestion — you can propose a new one.';
    await db.from('notification_logs').insert({
      user_id: otherId, title, body,
      type: 'playdate_chat_message', read: false, data: { chat_id: msg.chat_id },
    });
    await push(db, otherId, title, body, { type: 'playdate_chat_message', chat_id: msg.chat_id }, { color: '#FF8C55', flag: 'notif_chat' });
  }

  return json({ success: true });
}

async function handleChatCancel(db: ReturnType<typeof svc>, user: any, body: any) {
  const { chat_id, reason } = body;
  console.log(`[chat_cancel] chat_id=${chat_id} user=${user.id} reason=${reason ?? 'none'}`);
  if (!chat_id) return json({ error: 'chat_id required' }, 400);

  const { data: chat, error: chatErr } = await db.from('playdate_chats')
    .select('id, status, playdate_request_id, from_owner_id, to_owner_id, from_pet_id, to_pet_id, agreed_date, agreed_time, agreed_location')
    .eq('id', chat_id).single();
  console.log(`[chat_cancel] chat fetch: status=${chat?.status ?? 'null'} err=${chatErr?.message ?? 'none'}`);
  if (!chat) return json({ error: 'Chat not found' }, 404);

  console.log(`[chat_cancel] auth check: from_owner=${chat.from_owner_id} to_owner=${chat.to_owner_id} user=${user.id}`);
  if (chat.from_owner_id !== user.id && chat.to_owner_id !== user.id) return json({ error: 'Unauthorized' }, 403);
  if (chat.status === 'cancelled' || chat.status === 'declined') {
    console.log(`[chat_cancel] already closed: ${chat.status}`);
    return json({ error: 'Chat already closed' }, 409);
  }

  const newStatus = chat.status === 'agreed' ? 'cancelled' : 'declined';
  console.log(`[chat_cancel] updating chat to ${newStatus}`);
  const { data: claimed } = await db.from('playdate_chats')
    .update({ status: newStatus })
    .eq('id', chat_id)
    .eq('status', chat.status)
    .select('id');
  if (!claimed?.length) {
    console.log(`[chat_cancel] CAS failed — already closed`);
    return json({ error: 'Chat already closed' }, 409);
  }

  // Cancel any pending proposals in this chat
  await db.from('playdate_chat_messages')
    .update({ proposal_status: 'cancelled' })
    .eq('chat_id', chat_id)
    .eq('message_type', 'proposal')
    .eq('proposal_status', 'pending');

  // Sync the linked playdate_request
  const reqStatus = newStatus === 'cancelled' ? 'cancelled' : 'declined';
  const linkedReqId = chat.playdate_request_id ?? null;
  console.log(`[chat_cancel] syncing request: linked_req_id=${linkedReqId} → ${reqStatus}`);
  if (linkedReqId) {
    await db.from('playdate_requests')
      .update({ status: reqStatus, responder_user_id: user.id, cancel_reason: reason ?? null })
      .eq('id', linkedReqId)
      .in('status', ['accepted', 'scheduling', 'pending']);
  } else {
    await db.from('playdate_requests')
      .update({ status: reqStatus })
      .eq('from_pet_id', chat.from_pet_id)
      .eq('to_pet_id', chat.to_pet_id)
      .in('status', ['accepted', 'scheduling', 'pending'])
      .limit(1);
  }

  // Notify the other party
  const otherId = user.id === chat.from_owner_id ? chat.to_owner_id : chat.from_owner_id;
  const { fromPet, toPet } = await chatPets(db, chat);
  const myPet      = user.id === chat.from_owner_id ? fromPet : toPet;
  const endFirst   = await ownerFirst(db, user.id);
  const endLabel   = petLabel(endFirst, myPet?.emoji ?? '🐾', myPet?.name ?? 'Pet');
  console.log(`[chat_cancel] notifying otherId=${otherId} myPet=${myPet?.name ?? 'unknown'}`);
  const wasConfirmed = chat.status === 'agreed';
  const title = wasConfirmed
    ? `${endLabel} cancelled the playdate`
    : `${endLabel} ended the chat`;
  const dateSummary = wasConfirmed && chat.agreed_date
    ? fmtProposal(chat.agreed_date, chat.agreed_time, chat.agreed_location)
    : null;
  const notifBody = [dateSummary, reason ? `Reason: ${reason}` : null]
    .filter(Boolean).join('\n') || (wasConfirmed ? 'The confirmed playdate has been cancelled.' : 'The playdate chat has ended.');
  await db.from('notification_logs').insert({
    user_id: otherId, title, body: notifBody,
    type: 'playdate_cancelled', read: false, data: { chat_id, request_id: linkedReqId ?? null, reason: reason ?? null },
  });
  await push(db, otherId, title, notifBody, { type: 'playdate_cancelled', chat_id, request_id: linkedReqId ?? null }, { color: '#E24B4A' });

  console.log(`[chat_cancel] ✅ done chat_id=${chat_id}`);
  return json({ success: true });
}

// ─── main router ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body   = req.method === 'POST' ? await req.json() : {};
    const action = body.action as string | undefined;
    console.log(`[playdates] action=${action ?? 'none'} method=${req.method}`);
    const db = svc();

    // Cron action — no user auth required (called by pg_cron / service role)
    if (action === 'reminders') return await handleReminders(db);

    // All other actions require a valid user JWT
    const user = await getUser(req.headers.get('Authorization'));
    if (!user) return json({ error: 'Unauthorized' }, 401);

    switch (action) {
      case 'push':        return await handlePush(db, body);
      case 'request':     return await handleRequest(db, user, body);
      case 'respond':     return await handleRespond(db, user, body);
      case 'reschedule':  return await handleReschedule(db, user, body);
      case 'cancel':      return await handleCancel(db, user, body);
      case 'withdraw':    return await handleWithdraw(db, user, body);
      case 'resend':      return await handleResend(db, user, body);
      case 'complete':         return await handleComplete(db, user, body);
      case 'block':            return await handleBlock(db, user, body);
      case 'chat_send':        return await handleChatSend(db, user, body);
      case 'proposal_respond': return await handleProposalRespond(db, user, body);
      case 'proposal_cancel':  return await handleProposalCancel(db, user, body);
      case 'chat_cancel':      return await handleChatCancel(db, user, body);
      case 'notify':           return await handleNotify(db, user, body);
      default:                 return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('[playdates]', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
