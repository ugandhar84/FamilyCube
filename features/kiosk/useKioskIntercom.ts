/**
 * useKioskIntercom — the house intercom: broadcast an announcement from the
 * kitchen kiosk to every family member's PHONE.
 *
 * This is a genuinely real broadcast, not the mockup's toast. Two things
 * happen on every send, deliberately:
 *
 *   1. A real push notification, via the `family-notifier` Supabase edge
 *      function every other notification in this app already goes through
 *      (quests, rewards, help requests, kid requests, grocery — see
 *      store/helpStore.ts's notifyHelp, store/groceryStore.ts's startRun,
 *      etc.). It reads each member's `members.expo_push_token`, which is
 *      the token column that is actually populated for this app — NOT the
 *      leftover `push_tokens` table from a different project sharing this
 *      Supabase instance, a trap groceryStore.ts's own comment documents
 *      having already fallen into once. `type: 'custom'` because an
 *      intercom broadcast isn't one of the function's pre-built templates.
 *      `persist: true` so it also lands in the in-app notification panel
 *      for anyone whose phone was off.
 *
 *   2. A message in the family chat channel, so the announcement leaves a
 *      visible, durable trace somebody can scroll back to ("what did the
 *      kitchen say at 5:40?"). Sent with `suppressPush` so the same
 *      announcement doesn't arrive twice on every phone — the notifier
 *      call above is already the push.
 *
 * Excluding the sender: whoever's profile is active on the kiosk is
 * standing AT the kiosk. Pushing "Dinner is ready" to the phone in their
 * pocket while they're the one who pressed the button is noise, so they're
 * excluded from the push (but the chat message is still attributed to
 * them, which is correct — they did say it).
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/store/chatStore';
import { useFamilyStore } from '@/store/familyStore';

/** The family group channel, same id every other family-wide surface uses. */
const CHANNEL = 'all';

/**
 * The mockup's four one-tap announcements. Kept as presets because the
 * whole point of a kitchen intercom is that it's faster than picking up a
 * phone — a free-text field is offered too, but never at the cost of the
 * one-tap path.
 */
export const INTERCOM_PRESETS = [
  { emoji: '🍲', text: 'Dinner is ready!' },
  { emoji: '🎒', text: 'Time to leave for school!' },
  { emoji: '🚗', text: 'Heading out in 15 minutes — be ready!' },
  { emoji: '🧹', text: 'Kitchen clean-up, please!' },
] as const;

export interface IntercomResult {
  ok: boolean;
  /** How many phones the push was addressed to (0 is a real, reportable
   *  outcome — a one-member family, or everyone else soft-deleted). */
  recipients: number;
  error?: string;
}

export function useKioskIntercom() {
  const [sending, setSending] = useState(false);
  /** The last broadcast's own text — shown as a confirmation line so the
   *  person can see WHAT went out, not just that something did. */
  const [lastSent, setLastSent] = useState<{ text: string; at: number; recipients: number } | null>(null);

  const broadcast = useCallback(async (rawText: string, fromMemberId: string): Promise<IntercomResult> => {
    const text = rawText.trim();
    if (!text) return { ok: false, recipients: 0, error: 'Nothing to say' };

    setSending(true);
    try {
      const { members, familyName } = useFamilyStore.getState();
      const sender = members.find(m => m.id === fromMemberId);
      const senderName = sender?.name?.trim().split(' ')[0] ?? 'The kitchen';

      // Everyone who can actually receive: a soft-deleted member's id is
      // rejected downstream, and a still-pending invite has never had a
      // device attached, so neither is a real recipient. Same filter
      // KioskHeader/KioskLockScreen already apply to who's switchable.
      const recipients = members
        .filter(m => !m.deletedAt && m.inviteStatus !== 'pending' && m.id !== fromMemberId)
        .map(m => m.id);

      // A family id is needed for the notifier to scope the send. Resolve
      // it from the sender's own row rather than trusting a client-held
      // copy, matching how helpStore.notifyHelp does it.
      let familyId: string | undefined;
      try {
        const { data } = await supabase.from('members').select('family_id').eq('id', fromMemberId).single();
        familyId = data?.family_id ?? undefined;
      } catch { /* fall through — the chat message below still lands */ }

      // ── 1. The push ────────────────────────────────────────────────
      // Awaited rather than fire-and-forget: unlike a background nudge,
      // the person is standing at the device waiting to see whether their
      // announcement went out, so a silent failure is genuinely worse
      // than a slow button. Still non-fatal — a failed push must not
      // prevent the chat message from being written.
      let pushOk = true;
      if (familyId && recipients.length > 0) {
        try {
          const { error } = await supabase.functions.invoke('family-notifier', {
            body: {
              type: 'custom',
              familyId,
              memberIds: recipients,
              persist: true,
              payload: {
                title: `📢 ${familyName || 'Home'} intercom`,
                body: `${senderName}: ${text}`,
                data: { type: 'kiosk_intercom', from: fromMemberId },
              },
            },
          });
          if (error) pushOk = false;
        } catch {
          pushOk = false;
        }
      }

      // ── 2. The durable trace in family chat ────────────────────────
      // suppressPush: the notifier call above already pushed this exact
      // announcement; without it every phone buzzes twice.
      try {
        await useChatStore.getState().sendMessage(
          CHANNEL, fromMemberId, `📢 ${text}`,
          undefined, undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined,
          /* suppressPush */ true,
        );
      } catch (e: any) {
        console.warn('[kioskIntercom] chat write failed:', e?.message);
      }

      setLastSent({ text, at: Date.now(), recipients: recipients.length });
      return {
        ok: true,
        recipients: recipients.length,
        error: pushOk ? undefined : 'Posted to family chat, but the phone alert could not be sent.',
      };
    } finally {
      setSending(false);
    }
  }, []);

  return { broadcast, sending, lastSent };
}
