import Dexie, { type Table } from 'dexie';
import type { Reminder } from '../../types/reminders';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Folder, Note } from '../../types/notes';
import type { Database } from '../../types/database';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface OutboxEntry {
  id?: number;
  table: 'reminders' | 'events' | 'folders' | 'notes' | 'profiles';
  op: 'upsert' | 'delete';
  record_id: string;
  payload: any;
  created_at_ms: number;
  last_modified_ms: number;
  retries: number;
  error?: string;
}

export interface SyncMetadata {
  key: string;
  last_sync_ms: number;
  last_pull_at?: string;
}

export class VeyraLocalDB extends Dexie {
  reminders!: Table<Reminder, string>;
  events!: Table<CalendarEvent, string>;
  folders!: Table<Folder, string>;
  notes!: Table<Note, string>;
  profiles!: Table<ProfileRow, string>;
  outbox!: Table<OutboxEntry, number>;
  sync_metadata!: Table<SyncMetadata, string>;

  constructor() {
    super('veyra_local_db');

    this.version(1).stores({
      reminders: 'id, user_id, due_date_ms, status, last_modified_ms, deleted, event_id',
      events: 'id, user_id, start_time_ms, end_time_ms, last_modified_ms, deleted',
      folders: 'id, user_id, parent_id, name, last_modified_ms, deleted',
      notes: 'id, user_id, folder_id, title, updated_at_ms, last_modified_ms, deleted',
      profiles: 'id, user_profile, updated_at',
      outbox: '++id, table, op, record_id, created_at_ms, last_modified_ms, retries',
      sync_metadata: 'key',
    });
  }
}

export const localDB = new VeyraLocalDB();

