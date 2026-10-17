// FamilyCube — Edge Function: request-pin-reset
// Emails a 6-digit code (valid 10 minutes) to the account email of a member who forgot their PIN. Only the owner of that
// member's own login can ask for it; the PIN itself is never emailed (it is stored hashed and cannot be read back).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user } } = await anon.auth.getUser(token);
    if (!user || !user.email) return json({ error: 'Sign in with your account first.' }, 401);

    const { memberId } = await req.json() as { memberId?: string };
    if (!memberId) return json({ error: 'memberId is required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: member } = await db.from('members').select('id, name, auth_user_id, deleted_at').eq('id', memberId).maybeSingle();
    if (!member || member.deleted_at || member.auth_user_id !== user.id) {
      return json({ error: 'This profile is not linked to your account, so a code cannot be sent. Ask a parent to reset the PIN.' }, 403);
    }

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const { data: ok, error } = await db.rpc('issue_pin_reset', { p_member_id: memberId, p_code: code });
    if (error) throw new Error(error.message);
    if (!ok) return json({ error: 'A code was just sent. Wait a minute before asking again.' }, 429);

    const gmail = Deno.env.get('GMAIL_EMAIL'), pass = Deno.env.get('GMAIL_APP_PASSWORD');
    if (!gmail || !pass) return json({ error: 'Email is not set up on the server.' }, 500);
    const smtp = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: gmail, password: pass } } });
    try {
      await smtp.send({
        from: `Family Cube <${gmail}>`, to: user.email,
        subject: 'Your Family Cube PIN reset code',
        html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:auto;padding:24px">
          <h2 style="margin:0 0 8px">Reset your PIN</h2>
          <p>Hi ${member.name}, use this code to choose a new PIN. It works for 10 minutes.</p>
          <p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:18px 0">${code}</p>
          <p style="color:#6b6256;font-size:13px">If you did not ask for this, ignore this email. Your PIN has not changed.</p></div>`,
      });
    } finally { try { await smtp.close(); } catch { /* ignore */ } }
    return json({ ok: true, sentTo: user.email.replace(/^(.).*(@.*)$/, '$1***$2') });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
