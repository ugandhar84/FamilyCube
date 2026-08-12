// FamilyCube — Edge Function: notification-health-check
// Polls Expo push receipt endpoint to check delivery status of previously sent
// notifications. Flags DeviceNotRegistered tokens (stale) and failed tickets.
// Should run once a day (e.g. 06:00 via Supabase cron).
//
// Deploy: supabase functions deploy notification-health-check
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// DB: notifications table should have expo_receipt_id text column (optional).
//     Stale tokens are removed from members.expo_push_token automatically.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const report = {
      checkedReceipts:    0,
      ok:                 0,
      failed:             0,
      deviceNotRegistered: 0,
      staleTokensCleared: 0,
      errors:             [] as string[],
    };

    // ── 1. Pull recent unresolved notifications that have expo_receipt_id ─────
    const { data: pending } = await supabase
      .from('notifications')
      .select('id, member_id, expo_receipt_id')
      .not('expo_receipt_id', 'is', null)
      .eq('receipt_checked', false)
      .limit(300); // Expo allows 300 receipt IDs per request

    const receiptIds = (pending ?? [])
      .map(n => n.expo_receipt_id)
      .filter(Boolean) as string[];

    if (!receiptIds.length) {
      return json({ ok: true, message: 'No pending receipts to check', ...report });
    }

    // ── 2. Fetch receipts from Expo ───────────────────────────────────────────
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ ids: receiptIds }),
    });

    if (!res.ok) throw new Error(`Expo receipts HTTP ${res.status}: ${await res.text()}`);
    const { data: receipts } = await res.json() as { data: Record<string, { status: string; message?: string; details?: any }> };

    report.checkedReceipts = Object.keys(receipts).length;

    // ── 3. Process each receipt ───────────────────────────────────────────────
    const staleTokenMemberIds: string[] = [];
    const processedIds: string[] = [];

    for (const [receiptId, receipt] of Object.entries(receipts)) {
      const notif = (pending ?? []).find(n => n.expo_receipt_id === receiptId);
      processedIds.push(notif?.id ?? receiptId);

      if (receipt.status === 'ok') {
        report.ok++;
      } else {
        report.failed++;
        const detail = receipt.details ?? {};
        const errMsg = `receipt ${receiptId}: ${receipt.message ?? receipt.status}`;
        report.errors.push(errMsg);
        console.warn('[notification-health-check]', errMsg);

        // DeviceNotRegistered = token is stale, remove it from DB so we stop wasting sends
        if (detail.error === 'DeviceNotRegistered' && notif?.member_id) {
          staleTokenMemberIds.push(notif.member_id);
          report.deviceNotRegistered++;
        }
      }
    }

    // ── 4. Clear stale push tokens ────────────────────────────────────────────
    if (staleTokenMemberIds.length) {
      await supabase
        .from('members')
        .update({ expo_push_token: null })
        .in('id', [...new Set(staleTokenMemberIds)]);
      report.staleTokensCleared = new Set(staleTokenMemberIds).size;
      console.log(`[notification-health-check] Cleared ${report.staleTokensCleared} stale tokens`);
    }

    // ── 5. Mark receipts as checked ───────────────────────────────────────────
    if (processedIds.length) {
      await supabase
        .from('notifications')
        .update({ receipt_checked: true })
        .in('expo_receipt_id', receiptIds);
    }

    // ── 6. Summary log ────────────────────────────────────────────────────────
    console.log('[notification-health-check]', JSON.stringify(report));

    // ── 7. Alert if failure rate is high (>20%) ───────────────────────────────
    const failureRate = report.checkedReceipts > 0 ? report.failed / report.checkedReceipts : 0;
    if (failureRate > 0.2) {
      console.error(`[notification-health-check] HIGH FAILURE RATE: ${Math.round(failureRate * 100)}% — investigate Expo config or token health`);
    }

    return json({ ok: true, checkedAt: new Date().toISOString(), failureRate: Math.round(failureRate * 100) + '%', ...report });

  } catch (e: any) {
    console.error('[notification-health-check]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
