import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_REDIRECT_URI = "http://localhost:5173/poc-oauth-callback";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILES_BASE = "https://www.googleapis.com/drive/v3/files";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface CachedOAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  scope: string | null;
  tokenType: string | null;
  expiresAtMs: number | null;
}

// Ephemeral in-memory storage for PoC P4/P6/P7 within the warm Edge Function isolate.
const oauthMemoryStore: CachedOAuthState = {
  accessToken: null,
  refreshToken: null,
  scope: null,
  tokenType: null,
  expiresAtMs: null,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function getOAuthEnv() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI") ?? DEFAULT_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Supabase Edge Function secrets: GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

async function handleExchange(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed. Use POST with { code } or { serverAuthCode }." },
      405,
    );
  }

  const body = await req.json().catch(() => null);
  const serverAuthCode =
    typeof body?.serverAuthCode === "string" ? body.serverAuthCode.trim() : "";
  const webCode = typeof body?.code === "string" ? body.code.trim() : "";
  const isServerAuthCode = serverAuthCode.length > 0;
  const code = isServerAuthCode ? serverAuthCode : webCode;

  if (!code) {
    return jsonResponse(
      { error: "Missing required 'code' or 'serverAuthCode' in JSON body." },
      400,
    );
  }

  const { clientId, clientSecret, redirectUri: envRedirectUri } = getOAuthEnv();

  const form = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
  });

  if (isServerAuthCode) {
    // Android serverAuthCode expects redirect_uri="" unless explicitly overridden in JSON body.
    const serverRedirectUri =
      typeof body?.redirect_uri === "string" ? body.redirect_uri.trim() : "";
    form.set("redirect_uri", serverRedirectUri);
  } else {
    const redirectUri =
      typeof body?.redirect_uri === "string" && body.redirect_uri.trim().length > 0
        ? body.redirect_uri.trim()
        : envRedirectUri;
    form.set("redirect_uri", redirectUri);
  }

  if (typeof body?.code_verifier === "string" && body.code_verifier.trim().length > 0) {
    form.set("code_verifier", body.code_verifier.trim());
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    return jsonResponse(
      {
        error: "Google OAuth token exchange failed",
        flow: isServerAuthCode ? "android_server_auth_code" : "web_authorization_code",
        redirect_uri_sent: form.get("redirect_uri"),
        client_id_prefix: `${clientId.slice(0, 24)}...`,
        google_status: tokenRes.status,
        google_response: tokenData,
      },
      tokenRes.status,
    );
  }

  oauthMemoryStore.accessToken = tokenData.access_token ?? null;
  if (tokenData.refresh_token) {
    oauthMemoryStore.refreshToken = tokenData.refresh_token;
  }
  oauthMemoryStore.scope = tokenData.scope ?? null;
  oauthMemoryStore.tokenType = tokenData.token_type ?? null;
  oauthMemoryStore.expiresAtMs =
    typeof tokenData.expires_in === "number"
      ? Date.now() + tokenData.expires_in * 1000
      : null;

  return jsonResponse({
    ok: true,
    flow: isServerAuthCode ? "android_server_auth_code" : "web_authorization_code",
    cached_in_memory: Boolean(oauthMemoryStore.accessToken),
    has_refresh_token: Boolean(tokenData.refresh_token),
    access_token: tokenData.access_token ?? null,
    refresh_token: tokenData.refresh_token ?? null,
    expires_in: tokenData.expires_in ?? null,
    scope: tokenData.scope ?? null,
    token_type: tokenData.token_type ?? null,
  });
}

async function handleProxy(req: Request, url: URL): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use GET or POST on /proxy." }, 405);
  }

  let bodyFileId: string | null = null;
  let bodyAccessToken: string | null = null;
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    bodyFileId = typeof body?.fileId === "string" ? body.fileId.trim() : null;
    bodyAccessToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : null;
  }

  const fileId = (url.searchParams.get("fileId") ?? bodyFileId ?? "").trim();
  if (!fileId) {
    return jsonResponse({ error: "Missing required 'fileId' query param or body field." }, 400);
  }

  const accessToken =
    url.searchParams.get("accessToken") ??
    bodyAccessToken ??
    oauthMemoryStore.accessToken;

  if (!accessToken) {
    return jsonResponse(
      {
        error:
          "No access_token available in isolate memory. Run POST exchange first or pass accessToken explicitly if isolate cold-restarted.",
      },
      401,
    );
  }

  const driveUrl = `${GOOGLE_DRIVE_FILES_BASE}/${encodeURIComponent(fileId)}?alt=media`;
  const driveHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    driveHeaders["Range"] = rangeHeader;
  }

  const driveRes = await fetch(driveUrl, {
    method: "GET",
    headers: driveHeaders,
  });

  if (!driveRes.ok) {
    const errorBody = await driveRes.text();
    return jsonResponse(
      {
        ok: false,
        file_id: fileId,
        drive_status: driveRes.status,
        drive_error: errorBody,
      },
      driveRes.status,
    );
  }

  const mode = url.searchParams.get("mode") ?? "summary";
  if (mode === "stream") {
    return new Response(driveRes.body, {
      status: driveRes.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": driveRes.headers.get("content-type") ?? "application/octet-stream",
      },
    });
  }

  const bytes = new Uint8Array(await driveRes.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return jsonResponse({
    ok: true,
    file_id: fileId,
    drive_status: driveRes.status,
    content_type: driveRes.headers.get("content-type"),
    content_length: driveRes.headers.get("content-length"),
    bytes_read: bytes.byteLength,
    sha256,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, "");

    if (pathname.endsWith("/proxy")) {
      return await handleProxy(req, url);
    }

    return await handleExchange(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
