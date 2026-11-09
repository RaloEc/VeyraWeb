export type ReminderPriority = 1 | 2 | 3; // 1: Normal, 2: Estricto (Medio), 3: Crítico (Alto)
export type ReminderStatus = 'pending' | 'completed' | 'snoozed' | 'failed' | string;
export type ReminderControlLevel = 'normal' | 'strict' | 'critical' | string;

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date_ms: number;
  snooze_until_ms: number | null;
  repeat_rule: string | null;
  control_level: ReminderControlLevel | string | null;
  priority: number | null;
  status: ReminderStatus | string | null;
  next_attempt_ms: number | null;
  retry_count: number | null;
  max_retries: number | null;
  last_modified_ms: number;
  deleted: number | null;
  deleted_at_ms: number | null;
  subtasks: string | null;
  notification_ids?: string | null;
  attachments?: string | null;
  links?: string | null;
  event_id?: string | null;
  offset_minutes?: number | null;
}

export type ReminderFilterTab = 'today' | 'upcoming' | 'completed' | 'all';
