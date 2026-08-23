// FamilyCube — Edge Function: send-member-invite
// Parent invites someone by email to join their HOUSEHOLD (members/families)
// with their own real Supabase Auth login — distinct from the existing
// 6-digit family_invites code path, which stays PIN-only/no-email.
// Deploy: supabase functions deploy send-member-invite
// Secrets needed: ZOHO_EMAIL, ZOHO_APP_PASSWORD (same creds as Supabase Auth SMTP)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';
import { canNotify } from '../_shared/prefs.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const VALID_ROLES = ['parent', 'child', 'teenager', 'grandparent'];

function json(body: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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

    const { email, role, message } = await req.json();
    if (!email || !role) return json({ error: 'email and role required' }, 400, corsHeaders);
    if (!VALID_ROLES.includes(role)) {
      return json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, 400, corsHeaders);
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    // Verify the caller is a parent, and get their family — a direct members
    // query, not the pet-app's pet.owner_id check, since a household invite
    // is authorized by role within a family, not resource ownership.
    const { data: callerMember, error: callerErr } = await supabase
      .from('members')
      .select('id, family_id, name')
      .eq('auth_user_id', user.id)
      .eq('role', 'parent')
      .maybeSingle();

    if (callerErr || !callerMember) {
      return json({ error: 'Only parents can send invitations' }, 403, corsHeaders);
    }

    const familyId = callerMember.family_id;

    // Duplicate-pending-invite guard (also enforced at the DB layer via
    // idx_member_invitations_family_email_pending, so this is a friendlier
    // pre-check, not the only guard).
    const { data: existingInv } = await supabase
      .from('member_invitations')
      .select('id')
      .eq('family_id', familyId)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInv) {
      return json({ error: 'This person already has a pending invitation', code: 'DUPLICATE_INVITE' }, 400, corsHeaders);
    }

    // Already an active member of this family under this email?
    const { data: existingMember } = await supabase
      .from('members')
      .select('id')
      .eq('family_id', familyId)
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existingMember) {
      return json({ error: 'This person is already in your family' }, 400, corsHeaders);
    }

    const { data: family } = await supabase
      .from('families')
      .select('name')
      .eq('id', familyId)
      .single();

    const { data: inv, error: invErr } = await supabase
      .from('member_invitations')
      .insert({ family_id: familyId, email: normalizedEmail, role, invited_by: user.id, message, status: 'pending' })
      .select()
      .single();

    if (invErr) return json({ error: invErr.message }, 400, corsHeaders);

    const inviterName = callerMember.name ?? 'A family member';
    const familyName = family?.name ?? 'their family';
    const appUrl = Deno.env.get('APP_URL') ?? 'https://familycube.app';
    const inviteUrl = `${appUrl}/member-invite/${inv.token}`;
    const deepLink = `familycube://member-invite/${inv.token}`;

    let emailSent = false;
    let emailError: string | null = null;
    let pushSent = false;

    // ── Send email via Zoho Mail SMTP ────────────────────────────────────────
    const zohoEmail    = Deno.env.get('ZOHO_EMAIL');
    const zohoPassword = Deno.env.get('ZOHO_APP_PASSWORD');
    if (!zohoEmail || !zohoPassword) {
      emailError = 'ZOHO_EMAIL or ZOHO_APP_PASSWORD not configured';
      console.warn('[send-member-invite] Zoho SMTP credentials missing');
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
          from: `FamilyCube <connect@peopleontech.com>`,
          to: normalizedEmail,
          subject: `${inviterName} invited you to join ${familyName} on FamilyCube`,
          html: emailTemplate({ inviterName, familyName, role, message, inviteUrl, deepLink }),
          content: 'text/html',
        });
        emailSent = true;
      } catch (e) {
        emailError = (e as Error).message;
        console.error('[send-member-invite] Zoho SMTP error:', emailError);
      } finally {
        try { await smtpClient?.close(); } catch { /* ignore */ }
      }
    }

    // ── Best-effort push (if invitee already has a Supabase Auth account) ────
    try {
      const { data: { user: existingUser } } = await supabase.auth.admin.getUserByEmail(normalizedEmail);

      if (existingUser && await canNotify(supabase, existingUser.id, 'notif_family')) {
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('token')
          .eq('user_id', existingUser.id)
          .like('token', 'ExponentPushToken%');

        if (tokens && tokens.length > 0) {
          const pushMessages = tokens.map((t: any) => ({
            to: t.token,
            sound: 'default',
            title: `👋 You're invited to join ${familyName}!`,
            body: `${inviterName} wants you in their family on FamilyCube`,
            data: { type: 'member_invite', token: inv.token, family_id: familyId, deep_link: deepLink },
            priority: 'high',
            channelId: 'family',
          }));

          const pushRes = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(pushMessages),
          });

          pushSent = pushRes.ok;
          if (!pushRes.ok) console.error('[send-member-invite] Push failed:', pushRes.status);
        }
      }
    } catch (e) {
      console.warn('[send-member-invite] Push exception:', (e as Error).message);
    }

    // Invite is in the DB regardless of delivery outcome — email/push are
    // best-effort, matching send-family-invite's proven pattern.
    return json({
      success: true,
      invite_token: inv.token,
      invite_url: inviteUrl,
      deep_link: deepLink,
      email_sent: emailSent,
      email_error: emailError,
      push_sent: pushSent,
      message: emailSent
        ? `Invitation email sent to ${normalizedEmail}${pushSent ? ' (+ push notification)' : ''}`
        : pushSent
        ? `Push notification sent to ${normalizedEmail}`
        : `Invite created — email delivery pending (${emailError ?? 'no push tokens'})`,
    }, 200, corsHeaders);

  } catch (err: any) {
    console.error('[send-member-invite] error:', err);
    return json({ error: err.message }, 500, corsHeaders);
  }
});

function emailTemplate({ inviterName, familyName, role, message, inviteUrl, deepLink }: any) {
  const roleLabel = role === 'child' ? 'Kid' : role === 'teenager' ? 'Teen' : role === 'grandparent' ? 'Grandparent' : 'Parent';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F0E8FA; margin: 0; padding: 20px; }
  .card { background: white; border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto; }
  .logo { font-size: 48px; text-align: center; margin-bottom: 4px; }
  .app { font-size: 28px; font-weight: 700; color: #9261C7; text-align: center; margin-bottom: 24px; }
  .title { font-size: 24px; font-weight: 700; color: #1E2D6B; text-align: center; margin-bottom: 8px; }
  .desc { font-size: 15px; color: #64748B; text-align: center; margin-bottom: 24px; line-height: 1.6; }
  .msg { background: #F0E8FA; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-style: italic; color: #64748B; font-size: 14px; }
  .btn { display: block; background: #9261C7; color: white; text-decoration: none; text-align: center; padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 700; margin-bottom: 12px; }
  .footer { font-size: 12px; color: #94A3B8; text-align: center; margin-top: 24px; }
</style></head>
<body>
<div class="card">
  <div class="logo">🧩</div>
  <div class="app">Family Cube</div>
  <div class="title">You're invited! 🎉</div>
  <div class="desc">
    <strong>${inviterName}</strong> has invited you to join <strong>${familyName}</strong>
    as a <strong>${roleLabel}</strong> on Family Cube — with your own login, on your own device.
  </div>
  ${message ? `<div class="msg">"${message}"</div>` : ''}
  <a href="${deepLink}" class="btn">Open in Family Cube app</a>
  <a href="${inviteUrl}" class="btn" style="background: #F0E8FA; color: #9261C7;">Open in browser</a>
  <div class="footer">This invitation expires in 7 days · Family Cube</div>
</div>
</body>
</html>
  `.trim();
}
