// FamilyCube — Edge Function: generate-invite-code
// Creates or refreshes an 8-character invite code for a family: first 3
// letters of the FAMILY'S OWN NAME (uppercased, letters/digits only — makes
// a code instantly recognizable as "this one's for the Smiths" instead of a
// generic prefix) + 5 random alphanumeric characters. Previously a bare
// 6-digit number (900,000 possibilities — brute-forceable); the random
// suffix alone draws from 36^5 (~60M) possibilities per family-name prefix.
// Called by the parent from the app — returns the code to display.
// Codes expire in 7 days; calling again refreshes the expiry.
//
// Per-invitee invite system (20260924050000): `targetMemberId` scopes the
// generated code to ONE specific, already-existing member row (created by
// the parent beforehand via Profile's "Add family member" form, with
// invite_status = 'pending'). Redeeming the code claims THAT row (see
// join-family) instead of creating a new one, and the code dies on claim —
// not the old model where one reusable family-wide code stayed live after
// being used. `targetMemberId` is REQUIRED; the old family-wide "any code
// creates a fresh member" mode has been fully replaced (see this
// migration's own comment for why: the old mode's core bug — a claimed
// code staying live for anyone else who had it — is structural to "one
// code, no target," not fixable without a target).
//
// Deploy: supabase functions deploy generate-invite-code
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Excludes visually ambiguous characters (0/O, 1/I/L) so a code read aloud
// or handwritten from a screen doesn't get mistyped.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_LEN = 5;

// Strips anything that isn't a letter/digit, uppercases, and takes the
// first 3 characters — "The O'Brien Family" -> "THE", "Café Müller" -> "CAF"
// (diacritics stripped by the regex since \w-negation drops non-ASCII too).
// Padded with random alphabet characters if the family name is too short
// (e.g. a 1-2 letter name) or empty, so the prefix is always exactly 3.
function familyPrefix(familyName: string | null | undefined): string {
  const letters = (familyName ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let prefix = letters.slice(0, 3);
  while (prefix.length < 3) {
    prefix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return prefix;
}

function generateCode(familyName: string | null | undefined): string {
  let suffix = '';
  for (let i = 0; i < CODE_SUFFIX_LEN; i++) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `${familyPrefix(familyName)}${suffix}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // `memberId` (unchanged name, existing callers) = the CALLING parent's
    // own member id, used for auth. `targetMemberId` = the pre-created
    // member row this new code is scoped to — the person who will redeem
    // it. They're almost always different rows (a parent generating a code
    // for their kid); `targetMemberId` defaults to `memberId` only for the
    // narrow re-link case (a parent regenerating their OWN code, e.g. after
    // being logged out — unusual but not disallowed).
    const { familyId, memberId, targetMemberId } = await req.json() as
      { familyId: string; memberId: string; targetMemberId?: string };
    if (!familyId || !memberId) return json({ error: 'familyId and memberId required' }, 400);
    const scopedMemberId = targetMemberId ?? memberId;

    // memberId/familyId arrive in the body, so without verifying the caller's
    // own bearer token actually owns that memberId, anyone who knew or
    // guessed a parent's member id could mint a working invite code for a
    // family they have no access to — auth_user_id is the only thing here
    // that isn't attacker-controlled.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Not signed in' }, 401);
    }
    const token = authHeader.slice('Bearer '.length);
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return json({ error: 'Not signed in' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is a parent/senior in this family, AND that the claimed
    // memberId actually belongs to the authenticated caller's session.
    const { data: member } = await supabase
      .from('members')
      .select('role, family_id, auth_user_id')
      .eq('id', memberId)
      .single();

    if (!member || member.family_id?.toString() !== familyId) {
      return json({ error: 'Not a member of this family' }, 403);
    }
    if (member.auth_user_id !== user.id) {
      return json({ error: 'Not authorized for this member' }, 403);
    }
    if (!['parent', 'senior'].includes(member.role) && member.role !== 'grandparent') {
      return json({ error: 'Only parents can generate invite codes' }, 403);
    }

    // The target member (who will actually redeem this code) must also
    // belong to this same family — otherwise a caller could mint a
    // working code for someone else's pre-created member row.
    const { data: targetMember, error: targetErr } = await supabase
      .from('members')
      .select('id, family_id, name, invite_status, email')
      .eq('id', scopedMemberId)
      .single();
    if (targetErr || !targetMember || targetMember.family_id?.toString() !== familyId) {
      return json({ error: 'Target member not found in this family' }, 404);
    }

    const { data: family } = await supabase
      .from('families')
      .select('name')
      .eq('id', familyId)
      .maybeSingle();

    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();

    // One active code per MEMBER (not per family) — regenerating for the
    // same person (device switch, reinstall) replaces their own pending
    // code; it never touches another pending invitee's code.
    const { data: existing } = await supabase
      .from('family_invites')
      .select('id, code')
      .eq('member_id', scopedMemberId)
      .eq('status', 'pending')
      .maybeSingle();

    let code: string;

    if (existing) {
      // Refresh expiry + regenerate the code itself — "new invite for that
      // person" per spec, not just a TTL bump on the same string (an old,
      // possibly-already-shared code shouldn't silently keep working after
      // a parent thinks they've issued a fresh one).
      let attempts = 0;
      do {
        code = generateCode(family?.name);
        const { data: clash } = await supabase
          .from('family_invites')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!clash) break;
      } while (++attempts < 10);
      await supabase
        .from('family_invites')
        .update({ code, expires_at: expiresAt, created_by: memberId })
        .eq('id', existing.id);
    } else {
      // Generate a unique code (retry on collision)
      let attempts = 0;
      do {
        code = generateCode(family?.name);
        const { data: clash } = await supabase
          .from('family_invites')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!clash) break;
      } while (++attempts < 10);

      const { error } = await supabase.from('family_invites').insert({
        family_id:  familyId,
        member_id:  scopedMemberId,
        code,
        status:     'pending',
        created_by: memberId,
        expires_at: expiresAt,
      });
      if (error) throw new Error(error.message);
    }

    // Regenerating a code always means "this person hasn't joined yet" —
    // reset invite_status back to pending in case it had drifted (e.g. a
    // previous claim attempt partially failed client-side after the DB
    // write succeeded, or a parent is reissuing after a long gap).
    if (targetMember.invite_status !== 'active') {
      await supabase.from('members').update({ invite_status: 'pending' }).eq('id', scopedMemberId);
    }

    console.log(`[generate-invite-code] family=${familyId} member=${scopedMemberId} code=${code} expires=${expiresAt}`);

    // Best-effort email — only if this target member has an email on file
    // (the invite form's own "optional" field; PIN-only kids/GPs without
    // one just never get this, same as before). Never blocks/fails the
    // code-generation response — the code is already live in the DB
    // regardless of whether the email actually sends, same "best-effort,
    // report the outcome" pattern send-member-invite already used for its
    // own SMTP send (Zoho there; this project switched to Gmail — needs
    // GMAIL_EMAIL/GMAIL_APP_PASSWORD as Supabase secrets, a 16-char Google
    // App Password, not the account's real login password. Gmail SMTP
    // requires 2-Step Verification enabled on the account first).
    let emailSent = false;
    let emailError: string | null = null;
    if (targetMember.email) {
      const gmailEmail    = Deno.env.get('GMAIL_EMAIL');
      const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD');
      if (!gmailEmail || !gmailPassword) {
        emailError = 'GMAIL_EMAIL or GMAIL_APP_PASSWORD not configured';
        console.warn('[generate-invite-code] Gmail SMTP credentials missing');
      } else {
        let smtpClient: SMTPClient | null = null;
        try {
          smtpClient = new SMTPClient({
            connection: {
              hostname: 'smtp.gmail.com',
              port: 465,
              tls: true,
              auth: { username: gmailEmail, password: gmailPassword },
            },
          });
          await smtpClient.send({
            from: `Family Cube <${gmailEmail}>`,
            to: targetMember.email,
            subject: `Your Family Cube invite code`,
            html: inviteCodeEmailTemplate({ memberName: targetMember.name, familyName: family?.name, code }),
            content: 'text/html',
          });
          emailSent = true;
        } catch (e) {
          emailError = (e as Error).message;
          console.error('[generate-invite-code] Zoho SMTP error:', emailError);
        } finally {
          try { await smtpClient?.close(); } catch { /* ignore */ }
        }
      }
    }

    return json({ ok: true, code, expiresAt, memberId: scopedMemberId, memberName: targetMember.name, emailSent, emailError });

  } catch (e: any) {
    console.error('[generate-invite-code]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});

function inviteCodeEmailTemplate({ memberName, familyName, code }: { memberName: string; familyName: string | null | undefined; code: string }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #FAF8F4; margin: 0; padding: 20px; }
  .card { background: white; border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto; }
  .logo { font-size: 48px; text-align: center; margin-bottom: 4px; }
  .app { font-size: 28px; font-weight: 700; color: #DF613C; text-align: center; margin-bottom: 24px; }
  .title { font-size: 24px; font-weight: 700; color: #2C2722; text-align: center; margin-bottom: 8px; }
  .desc { font-size: 15px; color: #6B5F52; text-align: center; margin-bottom: 24px; line-height: 1.6; }
  .code { background: #FBEADF; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;
          font-size: 32px; font-weight: 900; letter-spacing: 4px; color: #DF613C; }
  .footer { font-size: 12px; color: #A69A8A; text-align: center; margin-top: 24px; }
</style></head>
<body>
<div class="card">
  <div class="logo">🧩</div>
  <div class="app">Family Cube</div>
  <div class="title">Hi ${memberName}! 👋</div>
  <div class="desc">
    ${familyName ? `You've been invited to join <strong>${familyName}</strong> on Family Cube.` : "You've been invited to join a family on Family Cube."}
    Open the app, tap "Join a Family," and enter this code to get started.
  </div>
  <div class="code">${code}</div>
  <div class="footer">This code expires in 7 days · Family Cube</div>
</div>
</body>
</html>
  `.trim();
}
