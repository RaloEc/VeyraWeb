export interface Folder {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  is_pinned: number;
  created_at_ms: number;
  updated_at_ms: number;
  last_modified_ms: number;
  deleted: number;
}

export interface NotePage {
  id: string;
  content: string;
}

export interface NoteContentPaginated {
  isPaginated: boolean;
  version: number;
  layout: string;
  pageFormat?: 'infinite' | 'a4';
  a4HeaderFooterConfig?: any;
  pages: NotePage[];
}

export interface Note {
  id: string;
  user_id: string;
  folder_id: string | null;
  event_id: string | null;
  title: string | null;
  content: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  is_pinned: number;
  deleted: number;
  last_modified_ms: number;
  created_at: string | null;
  sync_mode: 'rest' | 'yjs';
  preview_text: string | null;
}

export interface CollabUser {
  clientId: string;
  userId: string;
  name: string;
  color: string;
  avatar?: string;
  cursor?: {
    anchor: number;
    head: number;
  } | null;
}

