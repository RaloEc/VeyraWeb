export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          user_profile: string | null;
          default_control_level: string | null;
          is_premium: boolean | null;
          onboarding_completed: boolean | null;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          email?: string | null;
          user_profile?: string | null;
          default_control_level?: string | null;
          is_premium?: boolean | null;
          onboarding_completed?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string | null;
          user_profile?: string | null;
          default_control_level?: string | null;
          is_premium?: boolean | null;
          onboarding_completed?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          due_date_ms: number;
          snooze_until_ms: number | null;
          repeat_rule: string | null;
          control_level: string | null;
          priority: number | null;
          status: string | null;
          next_attempt_ms: number | null;
          retry_count: number | null;
          max_retries: number | null;
          last_modified_ms: number;
          deleted: number | null;
          deleted_at_ms: number | null;
          notification_ids: string | null;
          attachments: string | null;
          links: string | null;
          subtasks: string | null;
          event_id: string | null;
          offset_minutes: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          due_date_ms: number;
          snooze_until_ms?: number | null;
          repeat_rule?: string | null;
          control_level?: string | null;
          priority?: number | null;
          status?: string | null;
          next_attempt_ms?: number | null;
          retry_count?: number | null;
          max_retries?: number | null;
          last_modified_ms?: number;
          deleted?: number | null;
          deleted_at_ms?: number | null;
          notification_ids?: string | null;
          attachments?: string | null;
          links?: string | null;
          subtasks?: string | null;
          event_id?: string | null;
          offset_minutes?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          due_date_ms?: number;
          snooze_until_ms?: number | null;
          repeat_rule?: string | null;
          control_level?: string | null;
          priority?: number | null;
          status?: string | null;
          next_attempt_ms?: number | null;
          retry_count?: number | null;
          max_retries?: number | null;
          last_modified_ms?: number;
          deleted?: number | null;
          deleted_at_ms?: number | null;
          notification_ids?: string | null;
          attachments?: string | null;
          links?: string | null;
          subtasks?: string | null;
          event_id?: string | null;
          offset_minutes?: number | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          start_time_ms: number;
          end_time_ms: number;
          repeat_rule: string | null;
          recurrence_rule?: string | null;
          recurrence_parent_id?: string | null;
          location: string | null;
          color: string | null;
          note_id: string | null;
          folder_id?: string | null;
          deleted: number | null;
          tags: Json | null;
          is_all_day: boolean | null;
          all_day_date: string | null;
          timezone: string | null;
          is_birthday_like?: boolean | null;
          notification_offset_min?: number | null;
          notification_offsets?: string | null;
          notification_ids?: string | null;
          category_id?: string | null;
          attachments?: string | null;
          created_at_ms: number;
          updated_at_ms: number;
          last_modified_ms: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          start_time_ms: number;
          end_time_ms: number;
          repeat_rule?: string | null;
          recurrence_rule?: string | null;
          recurrence_parent_id?: string | null;
          location?: string | null;
          color?: string | null;
          note_id?: string | null;
          folder_id?: string | null;
          deleted?: number | null;
          tags?: Json | null;
          is_all_day?: boolean | null;
          all_day_date?: string | null;
          timezone?: string | null;
          is_birthday_like?: boolean | null;
          notification_offset_min?: number | null;
          notification_offsets?: string | null;
          notification_ids?: string | null;
          category_id?: string | null;
          attachments?: string | null;
          created_at_ms?: number;
          updated_at_ms?: number;
          last_modified_ms?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          start_time_ms?: number;
          end_time_ms?: number;
          repeat_rule?: string | null;
          recurrence_rule?: string | null;
          recurrence_parent_id?: string | null;
          location?: string | null;
          color?: string | null;
          note_id?: string | null;
          folder_id?: string | null;
          deleted?: number | null;
          tags?: Json | null;
          is_all_day?: boolean | null;
          all_day_date?: string | null;
          timezone?: string | null;
          is_birthday_like?: boolean | null;
          notification_offset_min?: number | null;
          notification_offsets?: string | null;
          notification_ids?: string | null;
          category_id?: string | null;
          attachments?: string | null;
          created_at_ms?: number;
          updated_at_ms?: number;
          last_modified_ms?: number;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          id: string;
          user_id: string;
          parent_id: string | null;
          name: string;
          icon: string | null;
          color: string | null;
          is_pinned: number | null;
          created_at_ms: number;
          updated_at_ms: number;
          last_modified_ms: number;
          deleted: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          parent_id?: string | null;
          name: string;
          icon?: string | null;
          color?: string | null;
          is_pinned?: number | null;
          created_at_ms?: number;
          updated_at_ms?: number;
          last_modified_ms?: number;
          deleted?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          parent_id?: string | null;
          name?: string;
          icon?: string | null;
          color?: string | null;
          is_pinned?: number | null;
          created_at_ms?: number;
          updated_at_ms?: number;
          last_modified_ms?: number;
          deleted?: number | null;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          folder_id: string | null;
          event_id: string | null;
          title: string | null;
          content: string | null;
          created_at_ms: number;
          updated_at_ms: number;
          is_pinned: number | null;
          attachments: string | null;
          links: string | null;
          deleted: number | null;
          last_modified_ms: number;
          created_at: string | null;
          sync_mode: 'rest' | 'yjs';
          preview_text: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          folder_id?: string | null;
          event_id?: string | null;
          title?: string | null;
          content?: string | null;
          created_at_ms?: number;
          updated_at_ms?: number;
          is_pinned?: number | null;
          attachments?: string | null;
          links?: string | null;
          deleted?: number | null;
          last_modified_ms?: number;
          created_at?: string | null;
          sync_mode?: 'rest' | 'yjs';
          preview_text?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          folder_id?: string | null;
          event_id?: string | null;
          title?: string | null;
          content?: string | null;
          created_at_ms?: number;
          updated_at_ms?: number;
          is_pinned?: number | null;
          attachments?: string | null;
          links?: string | null;
          deleted?: number | null;
          last_modified_ms?: number;
          created_at?: string | null;
          sync_mode?: 'rest' | 'yjs';
          preview_text?: string | null;
        };
        Relationships: [];
      };
      note_yjs_updates: {
        Row: {
          id: number;
          note_id: string;
          client_id: string;
          user_id: string | null;
          update_data: string;
          update_hash: string;
          created_at: string;
        };
        Insert: {
          note_id: string;
          client_id: string;
          user_id?: string | null;
          update_data: string;
          update_hash: string;
        };
        Update: {
          note_id?: string;
          client_id?: string;
          user_id?: string | null;
          update_data?: string;
          update_hash?: string;
        };
        Relationships: [];
      };
      note_yjs_snapshots: {
        Row: {
          note_id: string;
          snapshot: string;
          state_vector: string;
          server_clock: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          note_id: string;
          snapshot: string;
          state_vector: string;
          server_clock?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          note_id?: string;
          snapshot?: string;
          state_vector?: string;
          server_clock?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      share_invitations: {
        Row: {
          id: string;
          invite_code: string;
          owner_id: string;
          target_type: string;
          target_id: string;
          target_name: string | null;
          role: string;
          is_public_members: boolean | null;
          batch_items: Json | null;
          status: string;
          created_at: string | null;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          invite_code: string;
          owner_id: string;
          target_type: string;
          target_id: string;
          target_name?: string | null;
          role?: string;
          is_public_members?: boolean | null;
          batch_items?: Json | null;
          status?: string;
          created_at?: string | null;
          expires_at?: string | null;
        };
        Update: {
          id?: string;
          invite_code?: string;
          owner_id?: string;
          target_type?: string;
          target_id?: string;
          target_name?: string | null;
          role?: string;
          is_public_members?: boolean | null;
          batch_items?: Json | null;
          status?: string;
          created_at?: string | null;
          expires_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      append_note_yjs_update: {
        Args: {
          p_note_id: string;
          p_client_id: string;
          p_update_data: string;
          p_update_hash: string;
        };
        Returns: Json;
      };
      activate_note_yjs_mode: {
        Args: {
          p_note_id: string;
          p_client_id: string;
          p_initial_update_data: string;
          p_initial_update_hash: string;
          p_expected_content_hash: string;
          p_expected_updated_at_ms: number;
          p_initial_state_vector?: string | null;
        };
        Returns: Json;
      };
      accept_share_invitation: {
        Args: {
          p_invite_code: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
