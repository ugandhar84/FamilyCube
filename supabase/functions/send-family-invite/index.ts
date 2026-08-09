// PawBond — Edge Function: send-family-invite
// Creates a family invitation record and sends email (Zoho SMTP) + push notification.
// Deploy: supabase functions deploy send-family-invite
// Secrets needed: ZOHO_EMAIL, ZOHO_APP_PASSWORD (same creds as Supabase Auth SMTP)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';
import { canNotify } from './prefs.ts';
import { requirePro } from '../_shared/requirePro.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401, corsHeaders);

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401, corsHeaders);

    const { pet_id, email, role = 'caretaker', message } = await req.json();
    if (!pet_id || !email) return json({ error: 'pet_id and email required' }, 400, corsHeaders);

    // Verify caller owns the pet
    const { data: pet, error: petErr } = await supabase
      .from('pets')
      .select('name, emoji, owner_id')
      .eq('id', pet_id)
      .single();

    if (petErr || !pet) return json({ error: 'Pet not found' }, 404, corsHeaders);
    if (pet.owner_id !== user.id) return json({ error: 'Only the pet owner can invite' }, 403, corsHeaders);

    // Subscription gate: family management requires Pro or Ultimate
    const tierResult = await requirePro(supabase, user.id);
    if (tierResult === 'free') {
      return json({ error: 'Family management requires a Pro subscription.', code: 'SUBSCRIPTION_LIMIT' }, 402, corsHeaders);
    }

    // Check for duplicate active invitation
    const { data: existingInv } = await supabase
      .from('family_invitations')
      .select('id')
      .eq('pet_id', pet_id)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInv) {
      return json({ error: 'This user already has a pending invitation', code: 'DUPLICATE_INVITE' }, 400, corsHeaders);
    }

    // Get inviter profile
    const { data: inviter } = await supabase
      .from('profiles')
      .select('handle, full_name')
      .eq('id', user.id)
      .single();

    // Create invitation
    const { data: inv, error: invErr } = await supabase
      .from('family_invitations')
      .insert({ pet_id, invited_by: user.id, email: email.toLowerCase(), role, message, status: 'pending' })
      .select()
      .single();

    if (invErr) return json({ error: invErr.message }, 400, corsHeaders);

    const inviterName = inviter?.handle ? `@${inviter.handle}` : (inviter?.full_name ?? 'A PawBond user');
    const appUrl = Deno.env.get('APP_URL') ?? 'https://pawbond.app';
    const inviteUrl = `${appUrl}/invite/${inv.token}`;
    const deepLink = `pawbond://invite/${inv.token}`;

    let emailSent = false;
    let emailError: string | null = null;
    let pushSent = false;

    // ── Send email via Zoho Mail SMTP ────────────────────────────────────────
    const zohoEmail    = Deno.env.get('ZOHO_EMAIL');
    const zohoPassword = Deno.env.get('ZOHO_APP_PASSWORD');
    if (!zohoEmail || !zohoPassword) {
      emailError = 'ZOHO_EMAIL or ZOHO_APP_PASSWORD not configured';
      console.warn('[family-invite] Zoho SMTP credentials missing');
    } else {
      let smtpClient: SMTPClient | null = null;
      try {
        smtpClient = new SMTPClient({
          connection: {
            hostname: 'smtp.zoho.com',
            port: 465,
            tls: true,
            auth: { username: zohoEmail, password: zohoPassword },
          },
        });
        await smtpClient.send({
          from: `PawBond <connect@peopleontech.com>`,
          to: email,
          subject: `${inviterName} invited you to care for ${pet.emoji} ${pet.name} on PawBond`,
          html: emailTemplate({ inviterName, petName: pet.name, petEmoji: pet.emoji, role, message, inviteUrl, deepLink }),
          content: 'text/html',
        });
        emailSent = true;
      } catch (e) {
        emailError = (e as Error).message;
        console.error('[family-invite] Zoho SMTP error:', emailError);
      } finally {
        try { await smtpClient?.close(); } catch { /* ignore */ }
      }
    }

    // ── Send push notification (if user already has app + token) ──────────────
    try {
      // profiles table has no email column — look up the user via Auth admin API
      const { data: { user: existingUser } } = await supabase.auth.admin.getUserByEmail(email.toLowerCase());
      const userByEmail = existingUser ? { id: existingUser.id } : null;

      if (userByEmail && await canNotify(supabase, userByEmail.id, 'notif_family')) {
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('token')
          .eq('user_id', userByEmail.id)
          .like('token', 'ExponentPushToken%');

        if (tokens && tokens.length > 0) {
          const pushMessages = tokens.map((t: any) => ({
            to: t.token,
            sound: 'default',
            title: `🎉 You're invited to care for ${pet.emoji} ${pet.name}!`,
            body: `${inviterName} wants you on their pet's care team`,
            data: {
              type: 'family_invite',
              token: inv.token,
              pet_id,
              deep_link: deepLink,
            },
            priority: 'high',
            channelId: 'family',
          }));

          const pushRes = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(pushMessages),
          });

          pushSent = pushRes.ok;
          if (!pushRes.ok) {
            console.error('[family-invite] Push notification failed:', pushRes.status);
          }
        }
      }
    } catch (e) {
      console.warn('[family-invite] Push notification exception:', (e as Error).message);
      // Don't fail the whole request if push fails
    }

    // Log in-app notification for the inviter ("you sent an invite")
    await supabase.from('notification_logs').insert({
      user_id: user.id,
      title: `Invitation sent to ${email}`,
      body: `You invited someone to care for ${pet.emoji} ${pet.name}`,
      type: 'family_invite_sent',
      data: { invite_token: inv.token, pet_id },
    }).catch(() => {});

    // Also log in-app notification for the invitee if they already have the app
    if (pushSent) {
      try {
        const { data: { user: inviteeUser } } = await supabase.auth.admin.getUserByEmail(email.toLowerCase());
        if (inviteeUser) {
          await supabase.from('notification_logs').upsert({
            user_id: inviteeUser.id,
            title: `🎉 You're invited to care for ${pet.emoji} ${pet.name}!`,
            body: `${inviterName} wants you on their pet's care team`,
            type: 'family_invite',
            read: false,
            dedup_key: `family_invite:${inv.token}`,
            data: { type: 'family_invite', invite_token: inv.token, pet_id },
          }, { onConflict: 'user_id,dedup_key' }).catch(() => {});
        }
      } catch { /* ignore — push already sent */ }
    }

    // Invite is in the DB — always return 200 so the sender gets confirmation.
    // Email/push are best-effort delivery; the recipient can still accept via
    // a shared link or in-app notification if Resend is not configured.
    return json({
      success: true,
      invite_token: inv.token,
      invite_url: inviteUrl,
      deep_link: deepLink,
      email_sent: emailSent,
      email_error: emailError,
      push_sent: pushSent,
      message: emailSent
        ? `Invitation email sent to ${email}${pushSent ? ' (+ push notification)' : ''}`
        : pushSent
        ? `Push notification sent to ${email}`
        : `Invite created — email delivery pending (${emailError ?? 'no push tokens'})`,
    }, 200, corsHeaders);

  } catch (err: any) {
    console.error('[family-invite] error:', err);
    return json({ error: err.message }, 500, corsHeaders);
  }
});

function json(body: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function emailTemplate({ inviterName, petName, petEmoji, role, message, inviteUrl, deepLink }: any) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F5F2FC; margin: 0; padding: 20px; }
  .card { background: white; border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto; }
  .logo { font-size: 48px; text-align: center; margin-bottom: 4px; }
  .app { font-size: 28px; font-weight: 700; color: #7C5CBF; text-align: center; margin-bottom: 24px; }
  .pet { font-size: 72px; text-align: center; margin-bottom: 8px; }
  .title { font-size: 24px; font-weight: 700; color: #1A1025; text-align: center; margin-bottom: 8px; }
  .desc { font-size: 15px; color: #5C4F7C; text-align: center; margin-bottom: 24px; line-height: 1.6; }
  .msg { background: #F5F2FC; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-style: italic; color: #5C4F7C; font-size: 14px; }
  .btn { display: block; background: #7C5CBF; color: white; text-decoration: none; text-align: center; padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 700; margin-bottom: 12px; }
  .footer { font-size: 12px; color: #9B8EBB; text-align: center; margin-top: 24px; }
</style></head>
<body>
<div class="card">
  <div class="logo">🐾</div>
  <div class="app">PawBond</div>
  <div class="pet">${petEmoji}</div>
  <div class="title">You're invited! 🎉</div>
  <div class="desc">
    <strong>${inviterName}</strong> has invited you to join <strong>${petName}</strong>'s care team
    as a <strong>${role}</strong> on PawBond.
  </div>
  ${message ? `<div class="msg">"${message}"</div>` : ''}
  <a href="${deepLink}" class="btn">Open in PawBond app</a>
  <a href="${inviteUrl}" class="btn" style="background: #F0EAFB; color: #7C5CBF;">Open in browser</a>
  <div class="footer">This invitation expires in 7 days · PawBond — every day remembered 🐾</div>
</div>
</body>
</html>
  `.trim();
}
