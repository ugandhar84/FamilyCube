// Shared AI usage logger — every AI-calling edge function inserts one row
// per call here, server-side (never client-side — a client could simply
// not report usage, defeating the point of a cost/usage dashboard)
// [live-requested: "how many AI calls each user is making per service" /
// "how many call we are using per user and total per day week month year
// stats"]. Call counts and per-period rollups are computed by the admin
// console from created_at, so this just needs one row per call — no
// separate daily/weekly/monthly aggregate table.
//
// Fire-and-forget by design: a logging failure must never break the
// actual user-facing AI response. Caller should NOT await this on the
// request's critical path — call it and let it resolve in the background,
// or await it only after the real response has already been prepared.

export type AiService =
  | 'ask_cube' | 'family_ai' | 'flyer_parse' | 'parse_prescription'
  | 'grocery_receipt_parse' | 'analyze_medical_record'
  | 'analyze_appointment_recording' | 'grocery_ai_suggest' | 'moderate_message';

export interface AiUsageEntry {
  service: AiService;
  provider: string;
  model: string;
  memberId?: string | null;
  familyId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  success: boolean;
  errorMessage?: string | null;
  latencyMs?: number | null;
}

/** `supabase` must be a service-role client — this table has no client-side insert policy. */
export async function logAiUsage(supabase: any, entry: AiUsageEntry): Promise<void> {
  try {
    const { error } = await supabase.from('ai_usage_log').insert({
      service: entry.service,
      provider: entry.provider,
      model: entry.model,
      member_id: entry.memberId ?? null,
      family_id: entry.familyId ?? null,
      prompt_tokens: entry.promptTokens ?? null,
      completion_tokens: entry.completionTokens ?? null,
      total_tokens: entry.totalTokens ?? null,
      success: entry.success,
      error_message: entry.errorMessage ?? null,
      latency_ms: entry.latencyMs ?? null,
    });
    if (error) console.warn('[logAiUsage] insert failed:', error.message);
  } catch (e: any) {
    console.warn('[logAiUsage] unexpected error:', e?.message);
  }
}
