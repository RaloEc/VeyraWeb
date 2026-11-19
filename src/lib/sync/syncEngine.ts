import { supabase } from '../supabase';
import { localDB, type OutboxEntry } from '../db/local-db';
import type { Reminder } from '../../types/reminders';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Folder, Note } from '../../types/notes';

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'error';

class SyncEngine {
  private isProcessing = false;
  private isPulling = false;
  private currentStatus: SyncStatus = typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline';
  private pendingCount = 0;
  private listeners = new Set<(status: SyncStatus, pending: number) => void>();
  private processTimeout: any = null;
  private currentUserId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));

      // Initial pending count
      this.refreshPendingCount();
    }
  }

  public setUserId(userId: string | null) {
    if (this.currentUserId !== userId) {
      this.currentUserId = userId;
      if (userId && this.isOnline()) {
        this.syncAll(userId);
      }
    }
  }

  public isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  public getStatus(): SyncStatus {
    return this.currentStatus;
  }

  public getPendingCount(): number {
    return this.pendingCount;
  }

  public subscribe(cb: (status: SyncStatus, pending: number) => void): () => void {
    this.listeners.add(cb);
    cb(this.currentStatus, this.pendingCount);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.currentStatus, this.pendingCount);
    }
  }

  private setStatus(status: SyncStatus) {
    this.currentStatus = status;
    this.notify();
  }

  public async refreshPendingCount(): Promise<number> {
    try {
      const count = await localDB.outbox.count();
      this.pendingCount = count;
      this.notify();
      return count;
    } catch {
      return 0;
    }
  }

  private handleNetworkChange(online: boolean) {
    console.log(`🌐 [SyncEngine] Conexión cambió: ${online ? 'ONLINE' : 'OFFLINE'}`);
    if (online) {
      this.setStatus('online');
      this.processOutbox();
      if (this.currentUserId) {
        this.pullRemote(this.currentUserId);
      }
    } else {
      this.setStatus('offline');
    }
  }

  /**
   * Enqueue a mutation into the offline outbox
   */
  public async enqueue(
    table: OutboxEntry['table'],
    op: OutboxEntry['op'],
    record_id: string,
    payload: any,
    last_modified_ms: number = Date.now()
  ): Promise<void> {
    try {
      // Deduplicate: check if an outbox record for this table & id already exists
      const existing = await localDB.outbox
        .where({ table, record_id })
        .first();

      if (existing && existing.id !== undefined) {
        // If operation is delete, override whatever was before
        if (op === 'delete') {
          await localDB.outbox.update(existing.id, {
            op: 'delete',
            payload,
            last_modified_ms,
            retries: 0,
          });
        } else {
          // Merge payload for upsert
          await localDB.outbox.update(existing.id, {
            payload: { ...existing.payload, ...payload },
            last_modified_ms,
            retries: 0,
          });
        }
      } else {
        await localDB.outbox.add({
          table,
          op,
          record_id,
          payload,
          created_at_ms: Date.now(),
          last_modified_ms,
          retries: 0,
        });
      }

      await this.refreshPendingCount();

      // Trigger debounced flush if online
      if (this.isOnline()) {
        clearTimeout(this.processTimeout);
        this.processTimeout = setTimeout(() => this.processOutbox(), 300);
      }
    } catch (err) {
      console.error('[SyncEngine] Error enqueuing mutation:', err);
    }
  }

  /**
   * Process all pending mutations in the outbox
   */
  public async processOutbox(): Promise<void> {
    if (this.isProcessing || !this.isOnline()) return;

    this.isProcessing = true;
    this.setStatus('syncing');

    try {
      const items = await localDB.outbox.orderBy('id').toArray();
      if (items.length === 0) {
        this.setStatus('online');
        this.isProcessing = false;
        return;
      }

      console.log(`📤 [SyncEngine] Procesando ${items.length} mutaciones pendientes...`);

      // Saneamiento proactivo de notas en el outbox sin created_at_ms
      for (const item of items) {
        if (item.table === 'notes' && item.payload && !item.payload.created_at_ms) {
          try {
            const local = await localDB.notes.get(item.record_id);
            const validCreatedAt =
              local?.created_at_ms ||
              item.payload.updated_at_ms ||
              item.payload.last_modified_ms ||
              Date.now();
            item.payload.created_at_ms = validCreatedAt;
            if (item.id !== undefined) {
              await localDB.outbox.update(item.id, { payload: item.payload });
            }
          } catch (_) { }
        }
      }

      for (const item of items) {
        if (!this.isOnline()) break;

        try {
          let error: any = null;

          if (item.table === 'reminders') {
            if (item.op === 'delete') {
              const res = await supabase
                .from('reminders')
                .update({
                  deleted: 1,
                  deleted_at_ms: item.last_modified_ms,
                  last_modified_ms: item.last_modified_ms,
                })
                .eq('id', item.record_id);
              error = res.error;
            } else {
              // Intentar actualizar fila existente si es una mutación parcial
              const isFullPayload = item.payload && item.payload.id && item.payload.user_id;
              if (isFullPayload) {
                const res = await supabase.from('reminders').upsert(item.payload, { onConflict: 'id' });
                error = res.error;
              } else {
                const updateRes = await supabase.from('reminders').update(item.payload).eq('id', item.record_id);
                if (updateRes.error) {
                  const local = await localDB.reminders.get(item.record_id);
                  if (local) {
                    const { is_shared: _isShared, shared_owner_id: _owner, ...cleanLocal } = local as Reminder & { is_shared?: number; shared_owner_id?: string };
                    const full = { ...cleanLocal, ...item.payload, id: item.record_id };
                    const res = await supabase.from('reminders').upsert(full, { onConflict: 'id' });
                    error = res.error;
                  } else {
                    error = updateRes.error;
                  }
                }
              }
            }
          } else if (item.table === 'events') {
            if (item.op === 'delete') {
              const res = await supabase
                .from('events')
                .update({
                  deleted: 1,
                  last_modified_ms: item.last_modified_ms,
                })
                .eq('id', item.record_id);
              error = res.error;
            } else {
              const isFullPayload = item.payload && item.payload.id && item.payload.user_id;
              if (isFullPayload) {
                const res = await supabase.from('events').upsert(item.payload, { onConflict: 'id' });
                error = res.error;
              } else {
                const updateRes = await supabase.from('events').update(item.payload).eq('id', item.record_id);
                if (updateRes.error) {
                  const local = await localDB.events.get(item.record_id);
                  if (local) {
                    const full = { ...local, ...item.payload, id: item.record_id };
                    const res = await supabase.from('events').upsert(full, { onConflict: 'id' });
                    error = res.error;
                  } else {
                    error = updateRes.error;
                  }
                }
              }
            }
          } else if (item.table === 'folders') {
            if (item.op === 'delete') {
              const res = await supabase
                .from('folders')
                .update({
                  deleted: 1,
                  last_modified_ms: item.last_modified_ms,
                })
                .eq('id', item.record_id);
              error = res.error;
            } else {
              const isFullPayload = item.payload && item.payload.id && item.payload.user_id;
              if (isFullPayload) {
                const res = await supabase.from('folders').upsert(item.payload, { onConflict: 'id' });
                error = res.error;
              } else {
                const updateRes = await supabase.from('folders').update(item.payload).eq('id', item.record_id);
                if (updateRes.error) {
                  const local = await localDB.folders.get(item.record_id);
                  if (local) {
                    const full = { ...local, ...item.payload, id: item.record_id };
                    const res = await supabase.from('folders').upsert(full, { onConflict: 'id' });
                    error = res.error;
                  } else {
                    error = updateRes.error;
                  }
                }
              }
            }
          } else if (item.table === 'notes') {
            if (item.op === 'delete') {
              const res = await supabase
                .from('notes')
                .update({
                  deleted: 1,
                  last_modified_ms: item.last_modified_ms,
                })
                .eq('id', item.record_id);
              error = res.error;
            } else {
              // Si es una actualización parcial (o no tiene todas las columnas esenciales de inserción),
              // intentar UPDATE primero para no violar constraints NOT NULL en Supabase.
              const hasAllInsertColumns =
                item.payload &&
                item.payload.id &&
                item.payload.user_id &&
                item.payload.created_at_ms &&
                item.payload.title !== undefined;

              if (hasAllInsertColumns) {
                const safePayload = {
                  ...item.payload,
                  created_at_ms: item.payload.created_at_ms || Date.now(),
                  updated_at_ms: item.payload.updated_at_ms || Date.now(),
                  last_modified_ms: item.last_modified_ms || Date.now(),
                };
                const res = await supabase.from('notes').upsert(safePayload, { onConflict: 'id' });
                error = res.error;
              } else {
                // Mutación parcial -> intentar UPDATE directo primero
                const updateRes = await supabase
                  .from('notes')
                  .update(item.payload)
                  .eq('id', item.record_id);

                if (updateRes.error) {
                  // Si falló el UPDATE (ej: la fila todavía no existe en Supabase), reconstruir nota completa local
                  const local = await localDB.notes.get(item.record_id);
                  if (local) {
                    const full = {
                      ...local,
                      ...item.payload,
                      id: item.record_id,
                      created_at_ms:
                        local.created_at_ms ||
                        item.payload?.created_at_ms ||
                        local.updated_at_ms ||
                        Date.now(),
                      updated_at_ms: item.payload?.updated_at_ms || local.updated_at_ms || Date.now(),
                      last_modified_ms: item.last_modified_ms || Date.now(),
                    };
                    const res = await supabase.from('notes').upsert(full, { onConflict: 'id' });
                    error = res.error;
                  } else {
                    error = updateRes.error;
                  }
                }
              }
            }
          } else if (item.table === 'note_templates') {
            if (item.op === 'delete') {
              const res = await supabase
                .from('note_templates')
                .update({
                  deleted: 1,
                  last_modified_ms: item.last_modified_ms,
                })
                .eq('id', item.record_id);
              error = res.error;
            } else {
              const isFullPayload = item.payload && item.payload.id && item.payload.user_id;
              if (isFullPayload) {
                const res = await supabase.from('note_templates').upsert(item.payload, { onConflict: 'id' });
                error = res.error;
              } else {
                const updateRes = await supabase.from('note_templates').update(item.payload).eq('id', item.record_id);
                if (updateRes.error) {
                  const local = await localDB.note_templates.get(item.record_id);
                  if (local) {
                    const full = { ...local, ...item.payload, id: item.record_id };
                    const res = await supabase.from('note_templates').upsert(full, { onConflict: 'id' });
                    error = res.error;
                  } else {
                    error = updateRes.error;
                  }
                }
              }
            }
          } else if (item.table === 'compliance_events') {
            if (item.op === 'upsert' && item.payload) {
              const res = await supabase
                .from('compliance_events')
                .upsert({ ...item.payload, synced: 1 }, { onConflict: 'id' });
              error = res.error;
              if (!error) {
                await localDB.compliance_events.update(item.record_id, { synced: 1 }).catch(() => {});
              }
            }
          } else if (item.table === 'tags') {
            if (item.op === 'delete') {
              const res = await supabase.from('tags').delete().eq('id', item.record_id);
              error = res.error;
            } else if (item.payload) {
              const res = await supabase.from('tags').upsert(item.payload, { onConflict: 'id' });
              error = res.error;
            }
          } else if (item.table === 'item_tags') {
            if (item.op === 'delete' && item.payload) {
              const res = await supabase
                .from('item_tags')
                .delete()
                .match({
                  item_type: item.payload.item_type,
                  item_id: item.payload.item_id,
                  tag_id: item.payload.tag_id,
                });
              error = res.error;
            } else if (item.payload) {
              const res = await supabase
                .from('item_tags')
                .upsert(item.payload, { onConflict: 'item_type,item_id,tag_id' });
              error = res.error;
            }
          }

          if (error) {
            console.warn(`⚠️ [SyncEngine] Error en mutación [${item.table}:${item.record_id}]:`, error);
            if (item.id !== undefined) {
              const retries = (item.retries || 0) + 1;
              if (retries >= 5) {
                console.warn(`🗑️ [SyncEngine] Mutación [${item.table}:${item.record_id}] descartada tras ${retries} intentos fallidos.`);
                await localDB.outbox.delete(item.id);
              } else {
                await localDB.outbox.update(item.id, {
                  retries,
                  error: error.message || String(error),
                });
              }
            }
          } else {
            if (item.id !== undefined) {
              await localDB.outbox.delete(item.id);
            }
          }
        } catch (itemErr) {
          console.error('[SyncEngine] Error enviando item outbox:', itemErr);
          break; // Stop and retry later if network drops
        }
      }

      await this.refreshPendingCount();
      this.setStatus(this.isOnline() ? 'online' : 'offline');
    } catch (err) {
      console.error('[SyncEngine] Fallo en proceso outbox:', err);
      this.setStatus('error');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Pull remote changes from Supabase and merge them into local Dexie database
   */
  public async pullRemote(userId: string): Promise<void> {
    if (this.isPulling || !this.isOnline()) return;
    this.isPulling = true;

    try {
      // 1. Reminders
      const { data: remoteReminders, error: remErr } = await supabase
        .from('reminders')
        .select('*')
        .order('due_date_ms', { ascending: true });

      if (!remErr && remoteReminders) {
        // Last-Write-Wins: only overwrite local if remote has higher/equal last_modified_ms
        const outboxPending = new Set(
          (await localDB.outbox.where({ table: 'reminders' }).toArray()).map((o) => o.record_id)
        );

        for (const rawRem of remoteReminders as unknown as Reminder[]) {
          const rem = {
            ...rawRem,
            is_shared: rawRem.user_id !== userId ? 1 : 0,
            shared_owner_id: rawRem.user_id !== userId ? rawRem.user_id : undefined,
          };
          // If we have an un-synced local edit in outbox for this reminder, skip overwrite
          if (outboxPending.has(rem.id)) continue;

          const local = await localDB.reminders.get(rem.id);
          if (!local || rem.last_modified_ms >= (local.last_modified_ms || 0)) {
            await localDB.reminders.put(rem);
          }
        }
      }

      // 2. Events
      const { data: remoteEvents, error: evErr } = await supabase
        .from('events')
        .select('*')
        .order('start_time_ms', { ascending: true });

      if (!evErr && remoteEvents) {
        const outboxPending = new Set(
          (await localDB.outbox.where({ table: 'events' }).toArray()).map((o) => o.record_id)
        );

        for (const ev of remoteEvents as unknown as CalendarEvent[]) {
          if (outboxPending.has(ev.id)) continue;
          const local = await localDB.events.get(ev.id);
          const evModified = Number(ev.last_modified_ms || 0);
          if (!local || evModified >= (Number(local.last_modified_ms) || 0)) {
            await localDB.events.put({
              ...ev,
              start_time_ms: Number(ev.start_time_ms),
              end_time_ms: Number(ev.end_time_ms),
              created_at_ms: Number(ev.created_at_ms || 0),
              updated_at_ms: Number(ev.updated_at_ms || 0),
              last_modified_ms: evModified,
            });
          }
        }
      }

      // 3. Folders
      const { data: remoteFolders, error: folErr } = await supabase
        .from('folders')
        .select('*')
        .order('name', { ascending: true });

      if (!folErr && remoteFolders) {
        const outboxPending = new Set(
          (await localDB.outbox.where({ table: 'folders' }).toArray()).map((o) => o.record_id)
        );

        for (const fol of remoteFolders as unknown as Folder[]) {
          if (outboxPending.has(fol.id)) continue;
          const local = await localDB.folders.get(fol.id);
          const folModified = Number(fol.last_modified_ms || 0);
          if (!local || folModified >= (Number(local.last_modified_ms) || 0)) {
            await localDB.folders.put(fol);
          }
        }
      }

      // 4. Notes metadata
      const { data: remoteNotes, error: notesErr } = await supabase
        .from('notes')
        .select('*')
        .order('updated_at_ms', { ascending: false });

      if (!notesErr && remoteNotes) {
        const outboxPending = new Set(
          (await localDB.outbox.where({ table: 'notes' }).toArray()).map((o) => o.record_id)
        );

        for (const note of remoteNotes as unknown as Note[]) {
          if (outboxPending.has(note.id)) continue;
          const local = await localDB.notes.get(note.id);
          const noteModified = Number(note.last_modified_ms || 0);
          if (!local || noteModified >= (Number(local.last_modified_ms) || 0)) {
            await localDB.notes.put(note);
          }
        }
      }

      // 5. Note templates
      const { data: remoteTemplates, error: tplErr } = await supabase
        .from('note_templates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!tplErr && remoteTemplates) {
        const outboxPending = new Set(
          (await localDB.outbox.where({ table: 'note_templates' }).toArray()).map((o) => o.record_id)
        );

        for (const tpl of remoteTemplates) {
          if (outboxPending.has(tpl.id)) continue;
          const local = await localDB.note_templates.get(tpl.id);
          const tplModified = Number(tpl.last_modified_ms || 0);
          if (!local || tplModified >= (Number(local.last_modified_ms) || 0)) {
            await localDB.note_templates.put(tpl as any);
          }
        }
      }

      // 6. Compliance Events
      const { data: remoteCompliance, error: compErr } = await supabase
        .from('compliance_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp_ms', { ascending: false })
        .limit(500);

      if (!compErr && remoteCompliance && remoteCompliance.length > 0) {
        await localDB.compliance_events.bulkPut(
          remoteCompliance.map((ce) => ({
            id: ce.id,
            user_id: ce.user_id || userId,
            reminder_id: ce.reminder_id,
            event_type: ce.event_type,
            timestamp_ms: Number(ce.timestamp_ms),
            synced: 1,
          }))
        );
      }

      // 7. Tags & Item Tags
      const [{ data: remoteTags }, { data: remoteItemTags }] = await Promise.all([
        supabase.from('tags').select('*').eq('user_id', userId),
        supabase.from('item_tags').select('*').eq('user_id', userId),
      ]);

      if (remoteTags && remoteTags.length > 0) {
        await localDB.tags.bulkPut(
          remoteTags.map((t) => ({
            id: t.id,
            user_id: t.user_id || userId,
            name: t.name,
            slug: t.slug,
            color: t.color,
            created_at: Number(t.created_at),
            updated_at: Number(t.updated_at),
          }))
        );
      }

      if (remoteItemTags && remoteItemTags.length > 0) {
        await localDB.item_tags.bulkPut(
          remoteItemTags.map((it) => ({
            user_id: it.user_id || userId,
            item_type: it.item_type,
            item_id: it.item_id,
            tag_id: it.tag_id,
          }))
        );
      }

      await localDB.sync_metadata.put({
        key: 'global',
        last_sync_ms: Date.now(),
        last_pull_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[SyncEngine] Error in pullRemote:', err);
    } finally {
      this.isPulling = false;
    }
  }

  public async syncAll(userId: string) {
    if (!this.isOnline()) return;
    await this.processOutbox();
    await this.pullRemote(userId);
  }
}

export const syncEngine = new SyncEngine();

