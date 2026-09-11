/**
 * lib/notifications/display — pure, UI-agnostic notification display
 * helpers, shared by phone's NotificationPanel.tsx and kiosk's own
 * KioskNotificationPanel.tsx. Extracted so the two surfaces can never
 * silently disagree on which emoji a notification type gets, or how
 * "2h ago" is computed — a new notification type added later only needs
 * updating here, not in two places that could drift apart.
 */

export const TYPE_ICON: Record<string, string> = {
  quest_posted:     '🎯',
  quest_assigned:   '📋',
  quest_claimed:    '🙋',
  quest_submitted:  '📸',
  quest_approved:   '✅',
  quest_declined:   '❌',
  quest_reopened:   '🔄',
  force_assigned:   '📋',
  bonus_activated:  '🔥',
  bonus_expiring:   '⏰',
  coins_awarded:    '🪙',
  chore_ghosted:    '👻',
  deadline_reminder:'📅',
  deadline_overdue: '🚨',
  penalty_applied:  '🪙',
  help_requested:   '🆘',
  help_resolved:    '✅',
  reward_redeemed:  '🎁',
  reward_decision:  '🎁',
  kid_request:      '📣',
  kid_request_decision: '📣',
  chat_message:     '💬',
  family_update:    '👨‍👩‍👧',
};
export const DEFAULT_ICON = '🔔';

export function iconFor(type: string): string {
  return TYPE_ICON[type] ?? DEFAULT_ICON;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 7) return `${day}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
