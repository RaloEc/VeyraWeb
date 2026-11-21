#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const LEGACY_BUCKET = "attachments";
const TARGET_BUCKET = "veyra-attachments";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DRY_RUN = !process.argv.includes("--execute");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function sanitizeFilename(rawName) {
  const base = rawName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[/\\]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/\.{2,}/g, ".");
  if (!base || base === ".") return "file.bin";
  return base.slice(0, 80);
}

function inferMimeFromExt(filename, fallback) {
  if (fallback && fallback !== "application/octet-stream") return fallback;
  const ext = path.extname(filename).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
  };
  return map[ext] || fallback || "application/octet-stream";
}

async function listAllLegacyObjects(prefix = "") {
  const results = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from(LEGACY_BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });

    if (error) throw new Error(`Error listando "${prefix}": ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      // En Supabase Storage, las carpetas tienen id === null
      if (entry.id === null) {
        const nested = await listAllLegacyObjects(fullPath);
        results.push(...nested);
      } else {
        results.push({
          path: fullPath,
          name: entry.name,
          metadata: entry.metadata || {},
          created_at: entry.created_at,
        });
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return results;
}

async function loadReferenceTables() {
  const [notesRes, remindersRes, eventsRes] = await Promise.all([
    supabase.from("notes").select("id, user_id, content, attachments"),
    supabase.from("reminders").select("id, user_id, attachments"),
    supabase.from("events").select("id, user_id, attachments"),
  ]);

  if (notesRes.error) throw notesRes.error;
  if (remindersRes.error) throw remindersRes.error;
  if (eventsRes.error) throw eventsRes.error;

  return {
    notes: notesRes.data || [],
    reminders: remindersRes.data || [],
    events: eventsRes.data || [],
  };
}

function findEntityMatch(legacyPath, refs) {
  const encoded = legacyPath.split("/").map(encodeURIComponent).join("/");
  const matches = (text) =>
    typeof text === "string" && (text.includes(legacyPath) || text.includes(encoded));

  for (const n of refs.notes) {
    if (matches(n.content) || matches(n.attachments)) {
      return { target_type: "note", target_id: n.id, fallback_owner: n.user_id };
    }
  }
  for (const r of refs.reminders) {
    if (matches(r.attachments)) {
      return { target_type: "reminder", target_id: r.id, fallback_owner: r.user_id };
    }
  }
  for (const e of refs.events) {
    if (matches(e.attachments)) {
      return { target_type: "event", target_id: e.id, fallback_owner: e.user_id };
    }
  }
  return { target_type: "legacy_unlinked", target_id: null, fallback_owner: null };
}

async function run() {
  console.log(`\n=== Veyra Phase 4 Backfill (${DRY_RUN ? "DRY-RUN" : "EXECUTE"}) ===`);
  console.log(`Origen: ${LEGACY_BUCKET} -> Destino: ${TARGET_BUCKET}\n`);

  const [objects, refs] = await Promise.all([
    listAllLegacyObjects(),
    loadReferenceTables(),
  ]);

  console.log(`Objetos detectados en '${LEGACY_BUCKET}': ${objects.length}`);

  const stats = {
    total: objects.length,
    migrated: 0,
    skippedExisting: 0,
    linkedToEntity: 0,
    unlinkedLegacy: 0,
    failed: 0,
    bytesMigrated: 0,
  };

  for (const obj of objects) {
    const firstSegment = obj.path.split("/")[0];
    const match = findEntityMatch(obj.path, refs);
    const ownerId = UUID_RE.test(firstSegment) ? firstSegment : match.fallback_owner;

    if (!ownerId) {
      console.warn(`⚠️ [SKIP] Sin owner_id válido para ruta: ${obj.path}`);
      stats.failed++;
      continue;
    }

    // Comprobar idempotencia en public.attachments
    const { data: existing, error: existErr } = await supabase
      .from("attachments")
      .select("id")
      .eq("metadata->>legacy_path", obj.path)
      .maybeSingle();

    if (existErr) {
      console.error(`❌ Error consultando idempotencia para ${obj.path}:`, existErr.message);
      stats.failed++;
      continue;
    }
    if (existing) {
      console.log(`⏭️ [EXISTE] ${obj.path} -> attachment ${existing.id}`);
      stats.skippedExisting++;
      continue;
    }

    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFilename(obj.name);
    const targetPath = `${ownerId}/${attachmentId}/${safeName}`;

    if (match.target_id) stats.linkedToEntity++;
    else stats.unlinkedLegacy++;

    if (DRY_RUN) {
      console.log(
        `[DRY-RUN] ${obj.path} -> ${TARGET_BUCKET}/${targetPath} | target=${match.target_type}:${match.target_id ?? "null"} | owner=${ownerId}`,
      );
      stats.migrated++;
      stats.bytesMigrated += Number(obj.metadata?.size || 0);
      continue;
    }

    try {
      // 1. Descargar bytes reales del bucket legacy
      const { data: blob, error: dlErr } = await supabase.storage
        .from(LEGACY_BUCKET)
        .download(obj.path);
      if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message}`);

      const buffer = Buffer.from(await blob.arrayBuffer());
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const mimeType = inferMimeFromExt(obj.name, obj.metadata?.mimetype || blob.type);

      // 2. Subir al bucket privado nuevo
      const { error: upErr } = await supabase.storage
        .from(TARGET_BUCKET)
        .upload(targetPath, buffer, {
          contentType: mimeType,
          cacheControl: "31536000",
          upsert: false,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      // 3. Registrar en public.attachments
      const { error: insErr } = await supabase.from("attachments").insert({
        id: attachmentId,
        target_type: match.target_type,
        target_id: match.target_id,
        created_by: ownerId,
        storage_owner_id: ownerId,
        provider: "supabase",
        storage_bucket: TARGET_BUCKET,
        storage_path: targetPath,
        name: obj.name,
        mime_type: mimeType,
        size_bytes: buffer.byteLength,
        checksum_sha256: sha256,
        availability: "available",
        metadata: {
          legacy_bucket: LEGACY_BUCKET,
          legacy_path: obj.path,
          backfilled_at: new Date().toISOString(),
        },
      });

      if (insErr) {
        // Compensación: retirar el objeto nuevo si falló el INSERT en BD
        await supabase.storage.from(TARGET_BUCKET).remove([targetPath]);
        throw new Error(`DB insert failed: ${insErr.message}`);
      }

      stats.migrated++;
      stats.bytesMigrated += buffer.byteLength;
      console.log(
        `✅ [OK] ${obj.path} (${buffer.byteLength} B) -> ${targetPath} (${match.target_type}:${match.target_id ?? "null"})`,
      );
    } catch (err) {
      stats.failed++;
      console.error(`❌ [FAIL] ${obj.path}:`, err.message);
    }
  }

  // 4. Reconciliar storage_usage al finalizar en modo --execute
  if (!DRY_RUN) {
    const { data: usageRows, error: recErr } = await supabase.rpc("rpc_reconcile_storage_usage");
    if (recErr) {
      console.error("❌ Error reconciliando storage_usage:", recErr.message);
    } else {
      console.log("\n📊 storage_usage reconciliado:");
      console.table(usageRows);
    }
  }

  console.log("\n=== Resumen ===");
  console.table(stats);
  if (DRY_RUN) {
    console.log("Ejecuta con --execute para aplicar el backfill real.");
  }
}

run().catch((err) => {
  console.error("Error fatal en backfill:", err);
  process.exit(1);
});
