import Dexie, { type Table } from 'dexie';
import type { Reminder } from '../../types/reminders';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Folder, Note } from '../../types/notes';
import type { Database } from '../../types/database';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface UserTemplateRecord {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  type: 'block' | 'page';
  content: string;
  icon_name: string;
  created_at: string;
  updated_at: string;
  last_modified_ms: number;
  deleted: number;
}

export interface ComplianceEventRecord {
  id: string;
  user_id: string;
  reminder_id: string;
  event_type: 'completed' | 'failed' | 'snoozed' | 'mass_snooze' | string;
  timestamp_ms: number;
  synced: number;
}

export interface TagRecord {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  color: string | null;
  created_at: number;
  updated_at: number;
}

export interface ItemTagRecord {
  user_id: string;
  item_type: 'event' | 'reminder' | 'note' | string;
  item_id: string;
  tag_id: string;
}

export interface OutboxEntry {
  id?: number;
  table:
    | 'reminders'
    | 'events'
    | 'folders'
    | 'notes'
    | 'profiles'
    | 'note_templates'
    | 'compliance_events'
    | 'tags'
    | 'item_tags';
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
  note_templates!: Table<UserTemplateRecord, string>;
  compliance_events!: Table<ComplianceEventRecord, string>;
  tags!: Table<TagRecord, string>;
  item_tags!: Table<ItemTagRecord, [string, string, string]>;
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

    this.version(2).stores({
      note_templates: 'id, user_id, type, category, last_modified_ms, deleted',
    });

    this.version(3).stores({
      compliance_events: 'id, user_id, reminder_id, event_type, timestamp_ms, synced',
      tags: 'id, user_id, slug, name, updated_at',
      item_tags: '[item_type+item_id+tag_id], user_id, item_type, item_id, tag_id',
    });
  }
}

export const localDB = new VeyraLocalDB();
