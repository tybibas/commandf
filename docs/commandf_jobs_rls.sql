-- Fix: public.commandf_jobs has Row Level Security DISABLED.
-- Impact: anyone with the anon key can read/modify every row in this table.
--
-- This table (the deck/generation job records) is written by the Modal backend
-- with the SERVICE ROLE (which bypasses RLS) and is read by the frontend only
-- through the authenticated backend endpoint GET /generate/{job_id} — the
-- browser never queries it directly via the Supabase client. So simply enabling
-- RLS with NO client policy is the correct, safe posture: the service role still
-- has full access; anon/authenticated clients get none.
--
-- Review, then run in the Supabase SQL editor.

ALTER TABLE public.commandf_jobs ENABLE ROW LEVEL SECURITY;

-- (Optional) If you later want signed-in operators to read their OWN jobs
-- directly from the browser, add a policy scoped to the owner column, e.g.:
--   CREATE POLICY "operators read own jobs" ON public.commandf_jobs
--     FOR SELECT TO authenticated
--     USING (user_id = auth.uid());
-- Do NOT add a broad USING (true) policy — that re-opens the table.
