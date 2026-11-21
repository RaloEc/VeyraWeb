import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://rrwoompvuggcczggfgiq.supabase.co';
const SUPABASE_STORAGE_TUS_URL =
  process.env.SUPABASE_STORAGE_TUS_URL ??
  'https://rrwoompvuggcczggfgiq.storage.supabase.co/storage/v1/upload/resumable';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo';

const BUCKET_ID = 'poc-drive-v31';
const SIX_MB = 6 * 1024 * 1024; // 6,291,456 bytes

const email = process.env.POC_TEST_EMAIL ?? process.argv[2];
const password = process.env.POC_TEST_PASSWORD ?? process.argv[3];

if (!email || !password) {
  console.error(
    'Missing test user credentials. Provide POC_TEST_EMAIL and POC_TEST_PASSWORD env vars or pass <email> <password> as CLI arguments.'
  );
  process.exit(1);
}

/**
 * Executes a resumable TUS upload of an in-memory Buffer to Supabase Storage.
 * @param {object} params
 * @param {string} params.accessToken
 * @param {string} params.bucketName
 * @param {string} params.objectName
 * @param {Buffer} params.buffer
 * @returns {Promise<{ uploadUrl: string | null }>}
 */
function uploadViaTus({ accessToken, bucketName, objectName, buffer }) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(buffer, {
      endpoint: SUPABASE_STORAGE_TUS_URL,
      uploadSize: buffer.byteLength,
      chunkSize: SIX_MB,
      retryDelays: [0, 1000, 3000],
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName,
        objectName,
        contentType: 'application/octet-stream',
        cacheControl: '3600',
      },
      onProgress(bytesUploaded, bytesTotal) {
        const pct = ((bytesUploaded / bytesTotal) * 100).toFixed(1);
        console.log(`  [TUS progress] ${objectName}: ${bytesUploaded}/${bytesTotal} (${pct}%)`);
      },
      onSuccess() {
        resolve({ uploadUrl: upload.url });
      },
      onError(error) {
        reject(error);
      },
    });

    upload.start();
  });
}

function formatTusError(err) {
  const status = err?.originalResponse?.getStatus?.();
  const body = err?.originalResponse?.getBody?.();
  return {
    message: err?.message ?? String(err),
    httpStatus: status ?? null,
    responseBody: body ?? null,
  };
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`1) Signing in test user: ${email}`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.session || !authData.user) {
    console.error('Authentication failed:', authError?.message ?? 'No session returned');
    process.exit(1);
  }

  const { user, session } = authData;
  console.log(`   Authenticated user_id=${user.id}`);

  // Generate 6MB test payload
  const payload = crypto.randomBytes(SIX_MB);
  const timestamp = Date.now();

  // --- TEST A: Upload 6MB WITHOUT reservation (MUST fail with RLS error) ---
  const unreservedPath = `${user.id}/unreserved-${timestamp}.bin`;
  console.log(`\n2) Test A (NO reservation): Attempting 6MB TUS upload to ${BUCKET_ID}/${unreservedPath}`);

  let testAPassed = false;
  try {
    await uploadViaTus({
      accessToken: session.access_token,
      bucketName: BUCKET_ID,
      objectName: unreservedPath,
      buffer: payload,
    });
    console.error('   [FAIL] Test A unexpectedly succeeded without a reservation!');
  } catch (err) {
    const details = formatTusError(err);
    console.log('   [PASS] Test A rejected as expected:', JSON.stringify(details));
    testAPassed = true;
  }

  // --- TEST B: Create reservation in poc_upload_reservations & upload 6MB WITH TUS ---
  const reservedPath = `${user.id}/reserved-${timestamp}.bin`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  console.log(`\n3) Test B (WITH reservation): Inserting reservation for ${BUCKET_ID}/${reservedPath}`);
  const { data: reservation, error: reservationError } = await supabase
    .from('poc_upload_reservations')
    .insert({
      user_id: user.id,
      bucket_id: BUCKET_ID,
      path: reservedPath,
      reserved_bytes: SIX_MB,
      max_bytes: SIX_MB,
      status: 'active',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (reservationError) {
    console.error('   [FAIL] Could not create reservation:', reservationError);
    process.exit(1);
  }
  console.log(`   Reservation created: id=${reservation.id}, expires_at=${reservation.expires_at}`);

  let testBPassed = false;
  try {
    console.log(`   Starting 6MB TUS upload (chunkSize=${SIX_MB}) to ${BUCKET_ID}/${reservedPath}...`);
    const result = await uploadViaTus({
      accessToken: session.access_token,
      bucketName: BUCKET_ID,
      objectName: reservedPath,
      buffer: payload,
    });
    console.log(`   [PASS] Test B succeeded! uploadUrl=${result.uploadUrl}`);
    testBPassed = true;
  } catch (err) {
    const details = formatTusError(err);
    console.error('   [FAIL] Test B failed:', JSON.stringify(details));
  }

  console.log('\n=== PoC P11 Summary ===');
  console.log(`Test A (reject without reservation): ${testAPassed ? 'PASS' : 'FAIL'}`);
  console.log(`Test B (allow with active reservation via TUS 6MB): ${testBPassed ? 'PASS' : 'FAIL'}`);

  if (!testAPassed || !testBPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
