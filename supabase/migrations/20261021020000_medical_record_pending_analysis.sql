-- The AI's findings for a health document are kept (encrypted, like the approved analysis) as soon as they arrive, so leaving the screen or
-- closing the app does not lose them: the person reviews and approves later. Approving moves them into ai_analysis_json and clears this.
alter table public.medical_records add column if not exists ai_pending_json text;
