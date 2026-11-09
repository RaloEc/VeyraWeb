import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Reminder, ReminderPriority, ReminderControlLevel, Subtask } from '../types/reminders';
import type { Database } from '../types/database';
import { isDateToday, parseSubtasks } from '../lib/utils';
import confetti from 'canvas-confetti';

export function useReminders(userId?: string) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial reminders for authenticated user
  const fetchReminders = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId)
        .eq('deleted', 0)
        .order('due_date_ms', { ascending: true });

      if (error) throw error;
      setReminders((data as unknown as Reminder[]) || []);
    } catch (err: unknown) {
      console.error('[useReminders] Error fetching:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Subscribe in real-time with unique channel instance to prevent StrictMode / multi-mount collisions
  useEffect(() => {
    if (!userId) return;

    const channelName = `reminders-changes-${userId}-${Math.random().toString(36).substring(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reminders',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          setReminders((prev) => {
            if (eventType === 'INSERT') {
              const item = newRecord as Reminder;
              if (item.deleted === 1) return prev;
              if (prev.some((r) => r.id === item.id)) {
                return prev.map((r) => (r.id === item.id ? item : r));
              }
              return [...prev, item].sort((a, b) => a.due_date_ms - b.due_date_ms);
            }

            if (eventType === 'UPDATE') {
              const updated = newRecord as Reminder;
              if (updated.deleted === 1) {
                return prev.filter((r) => r.id !== updated.id);
              }
              return prev
                .map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
                .sort((a, b) => a.due_date_ms - b.due_date_ms);
            }

            if (eventType === 'DELETE') {
              return prev.filter((r) => r.id !== oldRecord.id);
            }

            return prev;
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useReminders] Subscribed to reminders-changes WebSocket channel');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Optimistic Toggle Reminder completion status
  const toggleReminder = useCallback(
    async (id: string, currentStatus: string | null) => {
      const isCurrentlyCompleted = currentStatus === 'completed';
      const nextStatus = isCurrentlyCompleted ? 'pending' : 'completed';
      const nowMs = Date.now();

      // Microinteraction celebratory confetti when completing
      if (nextStatus === 'completed') {
        confetti({
          particleCount: 45,
          spread: 65,
          origin: { y: 0.75 },
          colors: ['#3ab0b0', '#5ce1e6', '#2b8f8f'],
          disableForReducedMotion: true,
        });
      }

      // 1. Optimistic instant local update (0 ms UI latency)
      setReminders((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: nextStatus, last_modified_ms: nowMs }
            : r
        )
      );

      // 2. Background database sync
      try {
        const { error } = await supabase
          .from('reminders')
          .update({
            status: nextStatus,
            last_modified_ms: nowMs,
          })
          .eq('id', id);

        if (error) {
          console.error('[useReminders] Failed to update reminder status:', error);
          // Rollback on error
          setReminders((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: currentStatus } : r))
          );
        }
      } catch (err) {
        console.error('[useReminders] Exception toggling status:', err);
      }
    },
    []
  );

  // Optimistic Toggle Subtask completion inside reminder
  const toggleSubtask = useCallback(
    async (reminderId: string, subtaskId: string) => {
      const targetReminder = reminders.find((r) => r.id === reminderId);
      if (!targetReminder) return;

      const subtasks = parseSubtasks(targetReminder.subtasks);
      const updatedSubtasks = subtasks.map((st) =>
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      );

      const serialized = JSON.stringify(updatedSubtasks);
      const nowMs = Date.now();

      // 1. Optimistic update
      setReminders((prev) =>
        prev.map((r) =>
          r.id === reminderId
            ? { ...r, subtasks: serialized, last_modified_ms: nowMs }
            : r
        )
      );

      // 2. Background sync
      try {
        const { error } = await supabase
          .from('reminders')
          .update({
            subtasks: serialized,
            last_modified_ms: nowMs,
          })
          .eq('id', reminderId);

        if (error) {
          console.error('[useReminders] Error updating subtask:', error);
          fetchReminders();
        }
      } catch (err) {
        console.error('[useReminders] Exception updating subtask:', err);
      }
    },
    [reminders, fetchReminders]
  );

  // Create new reminder with UUID, due_date_ms, priority, control_level
  const createReminder = useCallback(
    async (payload: {
      title: string;
      description?: string;
      due_date_ms: number;
      priority?: ReminderPriority;
      control_level?: ReminderControlLevel;
      subtasks?: Subtask[];
    }) => {
      if (!userId) return;
      const newId = crypto.randomUUID();
      const nowMs = Date.now();

      const priorityNum = payload.priority || (payload.control_level === 'critical' ? 3 : payload.control_level === 'strict' ? 2 : 1);
      const controlLevel = payload.control_level || (priorityNum === 3 ? 'critical' : priorityNum === 2 ? 'strict' : 'normal');
      const subtasksJson = payload.subtasks && payload.subtasks.length > 0 ? JSON.stringify(payload.subtasks) : null;

      const newReminder: Reminder = {
        id: newId,
        user_id: userId,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        due_date_ms: payload.due_date_ms,
        snooze_until_ms: null,
        repeat_rule: null,
        control_level: controlLevel,
        priority: priorityNum,
        status: 'pending',
        next_attempt_ms: null,
        retry_count: 0,
        max_retries: 3,
        last_modified_ms: nowMs,
        deleted: 0,
        deleted_at_ms: null,
        subtasks: subtasksJson,
      };

      // Optimistic instant addition
      setReminders((prev) => [...prev, newReminder].sort((a, b) => a.due_date_ms - b.due_date_ms));

      try {
        const { error } = await supabase.from('reminders').insert({
          id: newId,
          user_id: userId,
          title: newReminder.title,
          description: newReminder.description,
          due_date_ms: newReminder.due_date_ms,
          control_level: newReminder.control_level,
          priority: newReminder.priority,
          status: 'pending',
          last_modified_ms: nowMs,
          deleted: 0,
          subtasks: newReminder.subtasks,
        });

        if (error) {
          console.error('[useReminders] Error inserting reminder:', error);
          setReminders((prev) => prev.filter((r) => r.id !== newId));
          throw error;
        }
      } catch (err) {
        console.error('[useReminders] Create reminder exception:', err);
        throw err;
      }
    },
    [userId]
  );

  // Update existing reminder
  const updateReminder = useCallback(
    async (
      id: string,
      updates: {
        title?: string;
        description?: string | null;
        due_date_ms?: number;
        priority?: ReminderPriority;
        control_level?: ReminderControlLevel;
        subtasks?: Subtask[];
      }
    ) => {
      const nowMs = Date.now();
      const subtasksJson = updates.subtasks !== undefined ? JSON.stringify(updates.subtasks) : undefined;

      const updateData: Database['public']['Tables']['reminders']['Update'] = {
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.due_date_ms !== undefined && { due_date_ms: updates.due_date_ms }),
        ...(updates.priority !== undefined && { priority: updates.priority }),
        ...(updates.control_level !== undefined && { control_level: updates.control_level }),
        ...(subtasksJson !== undefined && { subtasks: subtasksJson }),
        last_modified_ms: nowMs,
      };

      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updateData } : r))
      );

      try {
        const { error } = await supabase
          .from('reminders')
          .update(updateData)
          .eq('id', id);

        if (error) {
          fetchReminders();
          throw error;
        }
      } catch (err) {
        console.error('[useReminders] Update exception:', err);
        throw err;
      }
    },
    [fetchReminders]
  );

  // Soft delete reminder
  const deleteReminder = useCallback(async (id: string) => {
    const nowMs = Date.now();
    setReminders((prev) => prev.filter((r) => r.id !== id));

    try {
      const { error } = await supabase
        .from('reminders')
        .update({
          deleted: 1,
          deleted_at_ms: nowMs,
          last_modified_ms: nowMs,
        })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('[useReminders] Delete error:', err);
    }
  }, []);

  // Filtered views
  const todayReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (r.status === 'completed') return false;
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      // Either due today or overdue
      return r.due_date_ms <= todayEnd.getTime() || isDateToday(r.due_date_ms);
    });
  }, [reminders]);

  const upcomingReminders = useMemo(() => {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return reminders.filter(
      (r) => r.status !== 'completed' && r.due_date_ms > todayEnd.getTime()
    );
  }, [reminders]);

  const completedReminders = useMemo(() => {
    return reminders.filter((r) => r.status === 'completed');
  }, [reminders]);

  return {
    reminders,
    todayReminders,
    upcomingReminders,
    completedReminders,
    loading,
    error,
    toggleReminder,
    toggleSubtask,
    createReminder,
    updateReminder,
    deleteReminder,
    refresh: fetchReminders,
  };
}
