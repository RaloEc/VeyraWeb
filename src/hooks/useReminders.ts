import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Reminder, ReminderPriority, ReminderControlLevel, Subtask } from '../types/reminders';
import { isDateToday, parseSubtasks } from '../lib/utils';
import { computeNextReminderOccurrence } from '../services/recurrence/recurrenceEngine';
import { localDB } from '../lib/db/local-db';
import { syncEngine } from '../lib/sync/syncEngine';
import confetti from 'canvas-confetti';

export function useReminders(userId?: string) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Initial instant load from IndexedDB (0 ms offline start)
  useEffect(() => {
    let isMounted = true;
    localDB.reminders
      .filter((r) => r.deleted === 0 && (!userId || r.user_id === userId))
      .sortBy('due_date_ms')
      .then((cached) => {
        if (isMounted && cached.length > 0) {
          setReminders(cached);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[useReminders] Error reading from localDB:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  // 2. Fetch and sync reminders with Supabase
  const fetchReminders = useCallback(async () => {
    if (!userId) return;
    try {
      syncEngine.setUserId(userId);

      // Check offline first
      if (!syncEngine.isOnline()) {
        const cached = await localDB.reminders
          .filter((r) => r.deleted === 0 && r.user_id === userId)
          .sortBy('due_date_ms');
        setReminders(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId)
        .eq('deleted', 0)
        .order('due_date_ms', { ascending: true });

      if (error) throw error;

      const remoteList = (data as unknown as Reminder[]) || [];

      // Save to local IndexedDB for future offline usage
      if (remoteList.length > 0) {
        await localDB.reminders.bulkPut(remoteList);
      }

      setReminders(remoteList);
    } catch (err: unknown) {
      console.error('[useReminders] Error fetching:', err);
      setError((err as Error).message);
      // Fallback to local DB
      const cached = await localDB.reminders
        .filter((r) => r.deleted === 0 && (!userId || r.user_id === userId))
        .sortBy('due_date_ms');
      if (cached.length > 0) {
        setReminders(cached);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // 3. Realtime subscription (syncs incoming remote changes to local DB & state)
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
        async (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            const item = newRecord as Reminder;
            if (item.deleted === 1) {
              await localDB.reminders.delete(item.id);
              setReminders((prev) => prev.filter((r) => r.id !== item.id));
              return;
            }
            await localDB.reminders.put(item);
            setReminders((prev) => {
              if (prev.some((r) => r.id === item.id)) {
                return prev.map((r) => (r.id === item.id ? item : r));
              }
              return [...prev, item].sort((a, b) => a.due_date_ms - b.due_date_ms);
            });
          }

          if (eventType === 'UPDATE') {
            const updated = newRecord as Reminder;
            if (updated.deleted === 1) {
              await localDB.reminders.delete(updated.id);
              setReminders((prev) => prev.filter((r) => r.id !== updated.id));
              return;
            }
            await localDB.reminders.put(updated);
            setReminders((prev) =>
              prev
                .map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
                .sort((a, b) => a.due_date_ms - b.due_date_ms)
            );
          }

          if (eventType === 'DELETE') {
            if (oldRecord && oldRecord.id) {
              await localDB.reminders.delete(oldRecord.id);
              setReminders((prev) => prev.filter((r) => r.id !== oldRecord.id));
            }
          }
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

  // Create new reminder with UUID, local IndexedDB persistence and Outbox enqueue
  const createReminder = useCallback(
    async (payload: {
      title: string;
      description?: string;
      due_date_ms: number;
      priority?: ReminderPriority;
      control_level?: ReminderControlLevel;
      subtasks?: Subtask[];
      repeat_rule?: string | null;
      attachments?: string | null;
      links?: string | null;
      event_id?: string | null;
      offset_minutes?: number | null;
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
        repeat_rule: payload.repeat_rule || null,
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
        attachments: payload.attachments || null,
        links: payload.links || null,
        event_id: payload.event_id || null,
        offset_minutes: payload.offset_minutes !== undefined ? payload.offset_minutes : null,
      };

      // 1. Optimistic in-memory update
      setReminders((prev) => [...prev, newReminder].sort((a, b) => a.due_date_ms - b.due_date_ms));

      // 2. Persist to local IndexedDB
      await localDB.reminders.put(newReminder);

      // 3. Enqueue to Outbox (processed automatically if online, or saved for reconnect)
      await syncEngine.enqueue(
        'reminders',
        'upsert',
        newId,
        {
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
          repeat_rule: newReminder.repeat_rule,
          subtasks: newReminder.subtasks,
          attachments: newReminder.attachments,
          links: newReminder.links,
          event_id: newReminder.event_id,
          offset_minutes: newReminder.offset_minutes,
        },
        nowMs
      );
    },
    [userId]
  );

  // Optimistic Toggle Reminder completion status (with recurrence and outbox support)
  const toggleReminder = useCallback(
    async (id: string, currentStatus: string | null) => {
      const isCurrentlyCompleted = currentStatus === 'completed';
      const nextStatus = isCurrentlyCompleted ? 'pending' : 'completed';
      const nowMs = Date.now();

      const targetReminder = reminders.find((r) => r.id === id);

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

      // 1. Optimistic in-memory update
      setReminders((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: nextStatus, last_modified_ms: nowMs }
            : r
        )
      );

      // 2. Local IndexedDB update
      const localItem = await localDB.reminders.get(id);
      if (localItem) {
        await localDB.reminders.update(id, {
          status: nextStatus,
          last_modified_ms: nowMs,
        });
      }

      // 3. Enqueue to Outbox
      await syncEngine.enqueue(
        'reminders',
        'upsert',
        id,
        {
          status: nextStatus,
          last_modified_ms: nowMs,
        },
        nowMs
      );

      // 4. If completed and recurring, generate next occurrence
      if (nextStatus === 'completed' && targetReminder?.repeat_rule) {
        const nextDateMs = computeNextReminderOccurrence(
          targetReminder.due_date_ms,
          targetReminder.repeat_rule,
          nowMs
        );

        if (nextDateMs) {
          await createReminder({
            title: targetReminder.title,
            description: targetReminder.description || undefined,
            due_date_ms: nextDateMs,
            control_level: (targetReminder.control_level as ReminderControlLevel) || 'normal',
            priority: (targetReminder.priority as ReminderPriority) || 1,
            repeat_rule: targetReminder.repeat_rule,
            attachments: targetReminder.attachments,
            links: targetReminder.links,
            event_id: targetReminder.event_id,
            offset_minutes: targetReminder.offset_minutes,
          });
        }
      }
    },
    [reminders, createReminder]
  );

  // Snooze reminder
  const snoozeReminder = useCallback(
    async (id: string, minutes: number = 60) => {
      const nowMs = Date.now();
      const snoozeUntilMs = nowMs + minutes * 60 * 1000;

      // 1. Optimistic memory
      setReminders((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, snooze_until_ms: snoozeUntilMs, last_modified_ms: nowMs }
            : r
        )
      );

      // 2. Local IndexedDB
      await localDB.reminders.update(id, {
        snooze_until_ms: snoozeUntilMs,
        last_modified_ms: nowMs,
      });

      // 3. Outbox
      await syncEngine.enqueue(
        'reminders',
        'upsert',
        id,
        {
          snooze_until_ms: snoozeUntilMs,
          last_modified_ms: nowMs,
        },
        nowMs
      );
    },
    []
  );

  // Toggle Subtask
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

      // 1. In-memory
      setReminders((prev) =>
        prev.map((r) =>
          r.id === reminderId
            ? { ...r, subtasks: serialized, last_modified_ms: nowMs }
            : r
        )
      );

      // 2. Local IndexedDB
      await localDB.reminders.update(reminderId, {
        subtasks: serialized,
        last_modified_ms: nowMs,
      });

      // 3. Outbox
      await syncEngine.enqueue(
        'reminders',
        'upsert',
        reminderId,
        {
          subtasks: serialized,
          last_modified_ms: nowMs,
        },
        nowMs
      );
    },
    [reminders]
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
        repeat_rule?: string | null;
        attachments?: string | null;
        links?: string | null;
        event_id?: string | null;
        offset_minutes?: number | null;
      }
    ) => {
      const nowMs = Date.now();
      const priorityNum =
        updates.priority !== undefined
          ? updates.priority
          : updates.control_level === 'critical'
          ? 3
          : updates.control_level === 'strict'
          ? 2
          : updates.control_level === 'normal'
          ? 1
          : undefined;

      const subtasksJson = updates.subtasks ? JSON.stringify(updates.subtasks) : undefined;

      // 1. In-memory
      setReminders((prev) =>
        prev
          .map((r) => {
            if (r.id !== id) return r;
            return {
              ...r,
              ...(updates.title !== undefined && { title: updates.title.trim() }),
              ...(updates.description !== undefined && { description: updates.description?.trim() || null }),
              ...(updates.due_date_ms !== undefined && { due_date_ms: updates.due_date_ms }),
              ...(updates.control_level !== undefined && { control_level: updates.control_level }),
              ...(priorityNum !== undefined && { priority: priorityNum }),
              ...(updates.repeat_rule !== undefined && { repeat_rule: updates.repeat_rule }),
              ...(subtasksJson !== undefined && { subtasks: subtasksJson }),
              ...(updates.attachments !== undefined && { attachments: updates.attachments }),
              ...(updates.links !== undefined && { links: updates.links }),
              ...(updates.event_id !== undefined && { event_id: updates.event_id }),
              ...(updates.offset_minutes !== undefined && { offset_minutes: updates.offset_minutes }),
              last_modified_ms: nowMs,
            };
          })
          .sort((a, b) => a.due_date_ms - b.due_date_ms)
      );

      // 2. Prepare payload
      const updatePayload: Record<string, any> = {
        last_modified_ms: nowMs,
      };
      if (updates.title !== undefined) updatePayload.title = updates.title.trim();
      if (updates.description !== undefined) updatePayload.description = updates.description?.trim() || null;
      if (updates.due_date_ms !== undefined) updatePayload.due_date_ms = updates.due_date_ms;
      if (updates.control_level !== undefined) updatePayload.control_level = updates.control_level;
      if (priorityNum !== undefined) updatePayload.priority = priorityNum;
      if (updates.repeat_rule !== undefined) updatePayload.repeat_rule = updates.repeat_rule;
      if (subtasksJson !== undefined) updatePayload.subtasks = subtasksJson;
      if (updates.attachments !== undefined) updatePayload.attachments = updates.attachments;
      if (updates.links !== undefined) updatePayload.links = updates.links;
      if (updates.event_id !== undefined) updatePayload.event_id = updates.event_id;
      if (updates.offset_minutes !== undefined) updatePayload.offset_minutes = updates.offset_minutes;

      // 3. Local IndexedDB
      await localDB.reminders.update(id, updatePayload);

      // 4. Outbox
      await syncEngine.enqueue('reminders', 'upsert', id, updatePayload, nowMs);
    },
    []
  );

  // Soft delete reminder
  const deleteReminder = useCallback(async (id: string) => {
    const nowMs = Date.now();

    // 1. In-memory
    setReminders((prev) => prev.filter((r) => r.id !== id));

    // 2. Local IndexedDB
    await localDB.reminders.update(id, {
      deleted: 1,
      deleted_at_ms: nowMs,
      last_modified_ms: nowMs,
    });

    // 3. Outbox
    await syncEngine.enqueue('reminders', 'delete', id, null, nowMs);
  }, []);

  // Filtered views
  const todayReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (r.status === 'completed') return false;
      const effectiveDue = (r.snooze_until_ms && r.snooze_until_ms > Date.now()) ? r.snooze_until_ms : r.due_date_ms;
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      return effectiveDue <= todayEnd.getTime() || isDateToday(effectiveDue);
    });
  }, [reminders]);

  const upcomingReminders = useMemo(() => {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return reminders.filter((r) => {
      if (r.status === 'completed') return false;
      const effectiveDue = (r.snooze_until_ms && r.snooze_until_ms > Date.now()) ? r.snooze_until_ms : r.due_date_ms;
      return effectiveDue > todayEnd.getTime();
    });
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
    snoozeReminder,
    refresh: fetchReminders,
  };
}
