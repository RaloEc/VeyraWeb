# Veyra Plan v3.1 — Phase 0B PoC Technical Summary

**Project:** `rrwoompvuggcczggfgiq` (Supabase) / `veyra-poc-515220` (GCP)  
**Date:** 2026-11-19  
**Architectural Verdict:** **Variant W2 is officially confirmed as the winning Web architecture.**  
**Risk Status:** **Risk R2 (Backend Drive read compatibility with client-side Picker `drive.file` grant) is RETIRED.**

---

## 1. Executive Summary

All critical Web validation PoCs for Plan v3.1 Phase 0B (**P11**, **P10**, **P6**, and **P7**) succeeded empirically against production-grade Supabase Storage, Edge Functions, and Google Drive APIs:

1. **P11 (TUS + RLS Reservation Gate):** Supabase Storage resumable uploads (`tus-js-client`, 6 MiB chunks, `x-upsert: false`) enforce ephemeral reservation checks strictly with an **`INSERT`-only** RLS policy on `storage.objects`—requiring **zero** `UPDATE` or `DELETE` storage policies.
2. **P10 (Edge Function CPU Budget):** Processing 5 MiB (`bytes=0-5242879`) in 512 KiB chunks and hashing via `crypto.subtle.digest("SHA-256", ...)` inside Deno Edge Runtime consumed **`12.71 ms` of CPU time** (~0.64% of the 2,000 ms Supabase Edge Function CPU ceiling).
3. **P6 & P7 (OAuth Code Exchange + Backend Drive Media Proxy — Risk R2):** Authorization Code Exchange on the backend (`poc-google-oauth-exchange`) followed by selecting a file in Google Picker Web (`scope=https://www.googleapis.com/auth/drive.file`) yielded **`HTTP 200`** when the backend fetched `https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`.

Consequently, **Variant W2** (Web OAuth Authorization Code flow + client-side Google Picker + backend Drive media proxy/ingestion + TUS reservation-gated Storage uploads) is validated end-to-end and adopted as the official Web architecture.

---

## 2. Empirical Results Breakdown

### PoC P11 — Ephemeral Upload Reservations + TUS Resumable Upload + RLS

- **Schema & Security Objects (Migration `poc_p11_upload_reservations_schema`):**
  - Private bucket: `storage.buckets` -> `poc-drive-v31` (`public = false`).
  - Table: `public.poc_upload_reservations` with RLS enabled and `SELECT` / `INSERT` policies scoped to `auth.uid() = user_id` (`authenticated`).
  - Validator function: `public.poc_has_active_reservation(p_bucket_id text, p_path text)` defined with `SECURITY DEFINER` and `SET search_path = ''`, checking `r.user_id = (SELECT auth.uid())`, `r.status = 'active'`, and `r.expires_at > pg_catalog.now()`.
  - Storage policy on `storage.objects`: `poc_drive_v31_insert_with_reservation` (`FOR INSERT TO authenticated`), verifying `bucket_id = 'poc-drive-v31' AND public.poc_has_active_reservation(bucket_id, name)`. No `UPDATE` or `DELETE` policies exist on `poc-drive-v31`.
- **Client Test Execution (`poc-tus-test.mjs`, user `poc-test@veyra.app` / `df423d06-ef98-4e21-a9db-5e2cd7c07716`):**
  - **Test A (No reservation, 6 MiB TUS upload to `unreserved-1795126181049.bin`):**
    - Result: **PASS (Rejected as expected)** — `HTTP 403`, response body: `"new row violates row-level security policy"`.
  - **Test B (Active reservation `ab0836a9-b922-425b-b7e2-07f3d68989cc`, 6 MiB TUS upload, `chunkSize: 6291456`, `x-upsert: false`):**
    - Result: **PASS** — Uploaded `6,291,456 / 6,291,456` bytes (`100.0%`).
    - Persisted `storage.objects` row: `id = 664430f0-280b-465a-9514-ac730f14618d`, `mimetype = application/octet-stream`, `size = 6291456`.

---

### PoC P10 — Edge Function 5 MiB Streaming + SHA-256 CPU Budget

- **Edge Function:** `poc-drive-harness` (`id = a23b95c4-6980-4ae5-b9ec-00e8147e68b3`, `verify_jwt = false`)
- **Endpoint:** `https://rrwoompvuggcczggfgiq.supabase.co/functions/v1/poc-drive-harness`
- **Live Verification Request (`POST`, header `Range: bytes=0-5242879`):**
  ```json
  {
    "cpu_time_ms": 12.71,
    "hash": "2e7cab6314e9614b6f2da12630661c3038e5592025f6534ba5823c3b340a1cb6",
    "bytes_processed": 5242880,
    "range": "bytes=0-5242879",
    "mode": "synthetic_range",
    "network_time_ms": 0
  }
  ```
- **Takeaway:** Chunked 5 MiB processing + Web Crypto SHA-256 hashing stays well below Deno Edge isolate CPU limits (`12.71 ms` vs `2,000 ms` limit), leaving ample headroom for Drive streaming and TUS/Storage upload orchestration.

---

### PoC P6 & P7 — OAuth Authorization Code Exchange & Google Picker `drive.file` Backend Read

- **Edge Function:** `poc-google-oauth-exchange` (`id = 9c9599ab-eb2e-48ea-a43e-50e67b34b9b8`, `verify_jwt = false`)
- **Flow Validated via `poc-picker.html` (`http://localhost:5173`):**
  1. Web OAuth authorization redirect with `scope=https://www.googleapis.com/auth/drive.file`, `response_type=code`, `access_type=offline`, `prompt=consent`.
  2. Backend code exchange (`POST /poc-google-oauth-exchange`) against `https://oauth2.googleapis.com/token` (**P6 — `HTTP 200`**).
  3. Client-side Google Picker file selection using the issued `access_token`, `API Key`, and `App ID` (`592135232115`).
  4. Backend file download via `GET /poc-google-oauth-exchange/proxy?fileId=...` calling `https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` (**P7 — `HTTP 200`**).
- **Takeaway:** A file granted through the Google Picker Web UI under `drive.file` is immediately readable by the backend server using the OAuth token obtained during the backend Authorization Code Exchange (**Risk R2 eliminated**).

---

## 3. Remaining Phase 0B Scope

- **Android P4 PoC:** Validate native Android `Identity.getAuthorizationClient(...)` with `AuthorizationRequest.ResourceParameter.PICKER_OAUTH_TRIGGER` and `setOptOutIncludingGrantedScopes(true)` via an Expo Modules API Kotlin skeleton (see `android-poc-p4/`).
- **Cleanup:** Execute `poc-cleanup.sql` and delete temporary Edge Functions once Android P4 validation completes.
