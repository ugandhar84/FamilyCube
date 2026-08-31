// ── Auth ──────────────────────────────────────
export interface Profile {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  phone: string | null;
  timezone: string | null;
  bio: string | null;
  notification_enabled: boolean;
  ai_mood_consent: boolean;
  ai_mood_consent_date: string | null;
  created_at: string;
  updated_at: string | null;
}

// ── Notifications ─────────────────────────────
export interface NotificationLog {
  id: string;
  user_id: string;
  type:
    | 'reminder' | 'invite' | 'family_update' | 'system' | 'broadcast' | 'chat_message'
    // ── Family Cube quest/chore lifecycle (quest-event-notifier + chore-deadline-notifier) ──
    | 'quest_posted' | 'quest_assigned' | 'quest_claimed' | 'quest_submitted'
    | 'quest_approved' | 'quest_declined' | 'quest_reopened' | 'force_assigned'
    | 'bonus_activated' | 'bonus_expiring' | 'bonus_expired_penalty'
    | 'coins_awarded' | 'penalty_applied' | 'chore_ghosted'
    | 'deadline_reminder' | 'deadline_overdue'
    | 'help_requested' | 'help_resolved'
    | 'reward_redeemed' | 'reward_decision'
    | 'kid_request' | 'kid_request_decision'
    | (string & {});
  title: string;
  body: string;
  data: Record<string, any>;
  read: boolean;
  created_at: string;
}
