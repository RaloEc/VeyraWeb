-- ============================================================================
-- Veyra Phase 0B — Safe PoC Cleanup Script (DO NOT EXECUTE UNTIL ANDROID P4 FINISHES)
-- Project: rrwoompvuggcczggfgiq
-- ============================================================================
-- IMPORTANT PRE-STEP (Storage Bucket & Blobs):
--   Postgres has trigger `storage.protect_delete()` on `storage.objects` and
--   `storage.buckets`, which blocks direct SQL DELETEs to prevent orphaned blobs.
--   First empty and delete the bucket `poc-drive-v31` via:
--     * Supabase Dashboard -> Storage -> poc-drive-v31 -> Empty bucket -> Delete bucket
--     OR via Storage API with service_role:
--       await supabaseAdmin.storage.emptyBucket('poc-drive-v31');
--       await supabaseAdmin.storage.deleteBucket('poc-drive-v31');
-- ============================================================================

BEGIN;

-- 1. Drop INSERT-only RLS policy on storage.objects for poc-drive-v31
DROP POLICY IF EXISTS "poc_drive_v31_insert_with_reservation" ON storage.objects;

-- 2. Drop RLS policies & ephemeral reservations table
DROP POLICY IF EXISTS "poc_users_select_own_reservations" ON public.poc_upload_reservations;
DROP POLICY IF EXISTS "poc_users_insert_own_reservations" ON public.poc_upload_reservations;
DROP TABLE IF EXISTS public.poc_upload_reservations CASCADE;

-- 3. Drop SECURITY DEFINER validation function
DROP FUNCTION IF EXISTS public.poc_has_active_reservation(text, text);

-- 4. Remove temporary PoC test user created for P11
DELETE FROM auth.users
WHERE id = 'df423d06-ef98-4e21-a9db-5e2cd7c07716'
  AND email = 'poc-test@veyra.app';

COMMIT;

-- ============================================================================
-- POST-SQL CLEANUP (Edge Functions & Secrets):
--   The Supabase MCP server does not expose a delete_edge_function tool.
--   Remove both temporary functions via Supabase Dashboard -> Edge Functions
--   (or Supabase CLI):
--     supabase functions delete poc-drive-harness --project-ref rrwoompvuggcczggfgiq
--     supabase functions delete poc-google-oauth-exchange --project-ref rrwoompvuggcczggfgiq
--   Also delete temporary Google secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
--   GOOGLE_REDIRECT_URI) if they are no longer needed, and remove `poc-temp/`.
-- ============================================================================
