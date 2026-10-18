// Family Cube — Edge Function: ack-call-reminder
// Called straight from the phone's native code the moment a call reminder is picked up, so it works even when the app
// was killed and no login session exists. Authorised by an HMAC the sweeper put in the push (ackToken), not by a JWT.
// Deploy: supabase functions deploy ack-call-reminder --no-verify-jwt
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  try {
    const { itemType, itemId, dueAtIso, token } = await req.json();
    if (!itemType || !itemId || !dueAtIso || !token) return json({ error: 'missing fields' }, 400);
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dueKey = new Date(Math.floor(new Date(dueAtIso).getTime() / 60000) * 60000).toISOString();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${itemType}|${itemId}|${dueKey}`));
    const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (expected !== token) return json({ error: 'bad token' }, 403);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, secret);
    const { error } = await supabase.from('call_reminder_log').update({ answered: true })
      .eq('item_type', itemType).eq('item_id', itemId).eq('due_at', dueKey);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, 500);
  }
});
