import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_RANGE = "bytes=0-5242879"; // 5 MiB (5,242,880 bytes)
const MAX_POC_BYTES = 5 * 1024 * 1024;
const PART_CHUNK_BYTES = 512 * 1024; // 512 KiB chunks for part-by-part processing

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface ParsedRange {
  raw: string;
  start: number;
  end: number;
  length: number;
}

function parseByteRange(rangeHeader: string | null): ParsedRange {
  const raw = (rangeHeader ?? DEFAULT_RANGE).trim();
  const match = /^bytes=(\d+)-(\d+)$/i.exec(raw);
  if (!match) {
    throw new Error(`Invalid Range header '${raw}'. Expected format 'bytes=<start>-<end>'.`);
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error(`Invalid byte bounds in Range '${raw}'.`);
  }

  const length = end - start + 1;
  if (length > MAX_POC_BYTES) {
    throw new Error(`Range length ${length} exceeds 5 MiB PoC cap (${MAX_POC_BYTES} bytes).`);
  }

  return { raw: `bytes=${start}-${end}`, start, end, length };
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function readRemoteRangeInParts(
  fileUrl: string,
  parsedRange: ParsedRange,
  accessToken?: string,
  partSize = PART_CHUNK_BYTES,
): Promise<{ data: Uint8Array; cpuMs: number; networkMs: number }> {
  const assembled = new Uint8Array(parsedRange.length);
  let offset = 0;
  let cpuMs = 0;
  let networkMs = 0;

  while (offset < parsedRange.length) {
    const partStart = parsedRange.start + offset;
    const partEnd = Math.min(parsedRange.end, partStart + partSize - 1);
    const headers: Record<string, string> = {
      Range: `bytes=${partStart}-${partEnd}`,
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const netStart = performance.now();
    const res = await fetch(fileUrl, { headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Upstream range fetch failed (${res.status}): ${errText}`);
    }
    const reader = res.body?.getReader();
    networkMs += performance.now() - netStart;

    if (!reader) {
      const abStart = performance.now();
      const buf = new Uint8Array(await res.arrayBuffer());
      networkMs += performance.now() - abStart;

      const copyStart = performance.now();
      const writable = Math.min(buf.byteLength, parsedRange.length - offset);
      assembled.set(buf.subarray(0, writable), offset);
      offset += writable;
      cpuMs += performance.now() - copyStart;
      if (writable === 0) break;
      continue;
    }

    while (true) {
      const readNetStart = performance.now();
      const { value, done } = await reader.read();
      networkMs += performance.now() - readNetStart;
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      const copyCpuStart = performance.now();
      const writable = Math.min(value.byteLength, parsedRange.length - offset);
      assembled.set(value.subarray(0, writable), offset);
      offset += writable;
      cpuMs += performance.now() - copyCpuStart;

      if (offset >= parsedRange.length) {
        await reader.cancel();
        break;
      }
    }
  }

  return { data: assembled.subarray(0, offset), cpuMs, networkMs };
}

function generateSyntheticParts(
  parsedRange: ParsedRange,
  partSize = PART_CHUNK_BYTES,
): { data: Uint8Array; cpuMs: number } {
  const cpuStart = performance.now();
  const buffer = new Uint8Array(parsedRange.length);
  let offset = 0;

  while (offset < parsedRange.length) {
    const len = Math.min(partSize, parsedRange.length - offset);
    for (let i = 0; i < len; i++) {
      buffer[offset + i] = (parsedRange.start + offset + i) & 0xff;
    }
    offset += len;
  }

  const cpuMs = performance.now() - cpuStart;
  return { data: buffer, cpuMs };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      const text = await req.text();
      if (text.trim().length > 0) {
        body = JSON.parse(text);
      }
    }

    const url = new URL(req.url);
    const rangeInput =
      req.headers.get("range") ??
      (typeof body.range === "string" ? body.range : null) ??
      url.searchParams.get("range");
    const parsedRange = parseByteRange(rangeInput);

    const fileUrl =
      (typeof body.fileUrl === "string" ? body.fileUrl : null) ??
      url.searchParams.get("fileUrl");
    const accessToken =
      (typeof body.accessToken === "string" ? body.accessToken : undefined) ??
      (url.searchParams.get("accessToken") ?? undefined);
    const partSize =
      typeof body.partSize === "number" && body.partSize > 0
        ? Math.min(body.partSize, MAX_POC_BYTES)
        : PART_CHUNK_BYTES;

    let data: Uint8Array;
    let cpuMs = 0;
    let networkMs = 0;
    let mode: "remote_range_stream" | "synthetic_range";

    if (fileUrl) {
      mode = "remote_range_stream";
      const remote = await readRemoteRangeInParts(fileUrl, parsedRange, accessToken, partSize);
      data = remote.data;
      cpuMs += remote.cpuMs;
      networkMs += remote.networkMs;
    } else {
      mode = "synthetic_range";
      const synthetic = generateSyntheticParts(parsedRange, partSize);
      data = synthetic.data;
      cpuMs += synthetic.cpuMs;
    }

    const hashStart = performance.now();
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hash = toHex(digest);
    cpuMs += performance.now() - hashStart;

    return new Response(
      JSON.stringify({
        cpu_time_ms: Number(cpuMs.toFixed(3)),
        hash,
        bytes_processed: data.byteLength,
        range: parsedRange.raw,
        mode,
        network_time_ms: Number(networkMs.toFixed(3)),
      }),
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  }
});
