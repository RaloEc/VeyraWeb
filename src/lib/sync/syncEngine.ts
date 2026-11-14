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
                    const full = { ...local, ...item.payload, id: item.record_id };
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
              const isFullPayload = item.payload && item.payload.id && item.payload.user_id;
              if (isFullPayload) {
                const res = await supabase.from('notes').upsert(item.payload, { onConflict: 'id' });
                error = res.error;
              } else {
                const updateRes = await supabase.from('notes').update(item.payload).eq('id', item.record_id);
                if (updateRes.error) {
                  const local = await localDB.notes.get(item.record_id);
                  if (local) {
                    const full = { ...local, ...item.payload, id: item.record_id };
                    const res = await supabase.from('notes').upsert(full, { onConflict: 'id' });
                    error = res.error;
                  } else {
                    error = updateRes.error;
                  }
                }
              }
            }
          }

          if (error) {
            console.warn(`⚠️ [SyncEngine] Error en mutación [${item.table}:${item.record_id}]:`, error);
            if (item.id !== undefined) {
              await localDB.outbox.update(item.id, {
                retries: (item.retries || 0) + 1,
                error: error.message,
              });
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
        .eq('user_id', userId)
        .order('due_date_ms', { ascending: true });

      if (!remErr && remoteReminders) {
        // Last-Write-Wins: only overwrite local if remote has higher/equal last_modified_ms
        const outboxPending = new Set(
          (await localDB.outbox.where({ table: 'reminders' }).toArray()).map((o) => o.record_id)
        );

        for (const rem of remoteReminders as unknown as Reminder[]) {
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
        .eq('user_id', userId)
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

