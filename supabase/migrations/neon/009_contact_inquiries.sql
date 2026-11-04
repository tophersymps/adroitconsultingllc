-- ═══════════════════════════════════════════════════════════════════
-- 009_contact_inquiries.sql — store contact form submissions
--
-- WHY
--   Salesforce Web-to-Lead integration is retired. Inquiries are stored
--   directly in Neon and routed to notification channels (email, etc.).
--
-- SECURITY / ACCESS
--   * public.contact_inquiries has RLS ENABLED with ZERO client policies
--     (default-deny, matching the posture of public."user").
--   * REVOKE ALL from PUBLIC, authenticated, anonymous.
--   * The server-side write path (DATABASE_URL / neondb_owner) carries
--     BYPASSRLS and writes new rows directly.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL,
  role text,
  service text NOT NULL,
  timeline text,
  message text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_inquiries_created_at_idx
  ON public.contact_inquiries (created_at DESC);

ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  REVOKE ALL ON TABLE public.contact_inquiries FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.contact_inquiries FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.contact_inquiries FROM anonymous';
  END IF;
END $$;

COMMIT;
