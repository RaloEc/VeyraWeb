import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import { isDateToday } from '../lib/utils';
import { expandOccurrences } from '../services/recurrence/recurrenceEngine';

export type CalendarEvent = Database['public']['Tables']['events']['Row'];

export function useEvents(userId?: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .eq('deleted', 0)
        .order('start_time_ms', { ascending: true });

      if (error) throw error;
      const mapped = ((data as CalendarEvent[]) || []).map((e) => ({
        ...e,
        start_time_ms: Number(e.start_time_ms),
        end_time_ms: Number(e.end_time_ms),
        created_at_ms: Number(e.created_at_ms || 0),
        updated_at_ms: Number(e.updated_at_ms || 0),
        last_modified_ms: Number(e.last_modified_ms || 0),
      }));
      setEvents(mapped);
    } catch (err: unknown) {
      console.error('[useEvents] Error fetching:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Real-time subscription for events
  useEffect(() => {
    if (!userId) return;

    const channelName = `events-changes-${userId}-${Math.random().toString(36).substring(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          setEvents((prev) => {
            if (eventType === 'INSERT') {
              const raw = newRecord as CalendarEvent;
              if (raw.deleted === 1) return prev;
              const item: CalendarEvent = {
                ...raw,
                start_time_ms: Number(raw.start_time_ms),
                end_time_ms: Number(raw.end_time_ms),
              };
              if (prev.some((e) => e.id === item.id)) {
                return prev.map((e) => (e.id === item.id ? item : e));
              }
              return [...prev, item].sort((a, b) => a.start_time_ms - b.start_time_ms);
            }

            if (eventType === 'UPDATE') {
              const raw = newRecord as CalendarEvent;
              if (raw.deleted === 1) {
                return prev.filter((e) => e.id !== raw.id);
              }
              const updated: CalendarEvent = {
                ...raw,
                start_time_ms: Number(raw.start_time_ms),
                end_time_ms: Number(raw.end_time_ms),
              };
              return prev
                .map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
                .sort((a, b) => a.start_time_ms - b.start_time_ms);
            }

            if (eventType === 'DELETE') {
              return prev.filter((e) => e.id !== oldRecord.id);
            }

            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const createEvent = useCallback(
    async (payload: {
      title: string;
      description?: string;
      start_time_ms: number;
      end_time_ms: number;
      location?: string;
      color?: string;
      note_id?: string | null;
      folder_id?: string | null;
      is_all_day?: boolean;
      all_day_date?: string | null;
      timezone?: string | null;
      repeat_rule?: string | null;
      recurrence_rule?: string | null;
      is_birthday_like?: boolean;
      notification_offset_min?: number | null;
      notification_offsets?: string | null;
      tags?: string[] | string | null;
    }): Promise<string | undefined> => {
      if (!userId) return;
      const newId = crypto.randomUUID();
      const nowMs = Date.now();

      let parsedTags: string[] = [];
      if (Array.isArray(payload.tags)) {
        parsedTags = payload.tags;
      } else if (typeof payload.tags === 'string' && payload.tags.trim()) {
        try {
          const parsed = JSON.parse(payload.tags);
          parsedTags = Array.isArray(parsed) ? parsed : [payload.tags.trim()];
        } catch {
          parsedTags = [payload.tags.trim()];
        }
      }

      const insertData: Database['public']['Tables']['events']['Insert'] = {
        id: newId,
        user_id: userId,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        start_time_ms: payload.start_time_ms,
        end_time_ms: payload.end_time_ms,
        repeat_rule: payload.repeat_rule || null,
        recurrence_rule: payload.recurrence_rule || null,
        location: payload.location?.trim() || null,
        color: payload.color || '#3B82F6',
        note_id: payload.note_id || null,
        deleted: 0,
        tags: parsedTags,
        is_all_day: Boolean(payload.is_all_day),
        all_day_date: payload.all_day_date || null,
        timezone: payload.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        is_birthday_like: Boolean(payload.is_birthday_like),
        notification_offset_min: payload.notification_offset_min !== undefined ? payload.notification_offset_min : 15,
        notification_offsets: payload.notification_offsets ?? JSON.stringify([15]),
        notification_ids: JSON.stringify([]),
        created_at_ms: nowMs,
        updated_at_ms: nowMs,
        last_modified_ms: nowMs,
      };

      const newEvent: CalendarEvent = {
        id: newId,
        user_id: userId,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        start_time_ms: payload.start_time_ms,
        end_time_ms: payload.end_time_ms,
        repeat_rule: payload.repeat_rule || null,
        recurrence_rule: payload.recurrence_rule || null,
        location: payload.location?.trim() || null,
        color: payload.color || '#3B82F6',
        note_id: payload.note_id || null,
        deleted: 0,
        tags: parsedTags,
        is_all_day: Boolean(payload.is_all_day),
        all_day_date: payload.all_day_date || null,
        timezone: payload.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        is_birthday_like: Boolean(payload.is_birthday_like),
        notification_offset_min: payload.notification_offset_min !== undefined ? payload.notification_offset_min : 15,
        notification_offsets: payload.notification_offsets ?? JSON.stringify([15]),
        notification_ids: JSON.stringify([]),
        created_at_ms: nowMs,
        updated_at_ms: nowMs,
        last_modified_ms: nowMs,
      };

      setEvents((prev) => [...prev, newEvent].sort((a, b) => a.start_time_ms - b.start_time_ms));

      try {
        const { error } = await supabase.from('events').insert(insertData);
        if (error) {
          console.error('[useEvents] Insert error:', error);
          setEvents((prev) => prev.filter((e) => e.id !== newId));
          throw error;
        }
        return newId;
      } catch (err) {
        console.error('[useEvents] Exception inserting:', err);
        throw err;
      }
    },
    [userId]
  );

  const updateEvent = useCallback(
    async (id: string, updates: Partial<CalendarEvent>) => {
      const nowMs = Date.now();
      setEvents((prev) =>
        prev
          .map((e) =>
            e.id === id
              ? { ...e, ...updates, updated_at_ms: nowMs, last_modified_ms: nowMs }
              : e
          )
          .sort((a, b) => a.start_time_ms - b.start_time_ms)
      );

      try {
        const updateData: Database['public']['Tables']['events']['Update'] = {
          updated_at_ms: nowMs,
          last_modified_ms: nowMs,
        };

        if (updates.title !== undefined) updateData.title = updates.title.trim();
        if (updates.description !== undefined) updateData.description = updates.description?.trim() || null;
        if (updates.start_time_ms !== undefined) updateData.start_time_ms = updates.start_time_ms;
        if (updates.end_time_ms !== undefined) updateData.end_time_ms = updates.end_time_ms;
        if (updates.repeat_rule !== undefined) updateData.repeat_rule = updates.repeat_rule;
        if (updates.recurrence_rule !== undefined) updateData.recurrence_rule = updates.recurrence_rule;
        if (updates.location !== undefined) updateData.location = updates.location?.trim() || null;
        if (updates.color !== undefined) updateData.color = updates.color;
        if (updates.note_id !== undefined) updateData.note_id = updates.note_id;
        if (updates.deleted !== undefined) updateData.deleted = updates.deleted;
        if (updates.is_all_day !== undefined) updateData.is_all_day = Boolean(updates.is_all_day);
        if (updates.all_day_date !== undefined) updateData.all_day_date = updates.all_day_date;
        if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
        if (updates.is_birthday_like !== undefined) updateData.is_birthday_like = Boolean(updates.is_birthday_like);
        if (updates.notification_offset_min !== undefined) updateData.notification_offset_min = updates.notification_offset_min;
        if (updates.notification_offsets !== undefined) updateData.notification_offsets = updates.notification_offsets;
        if (updates.tags !== undefined) {
          if (Array.isArray(updates.tags)) {
            updateData.tags = updates.tags;
          } else if (typeof updates.tags === 'string' && updates.tags.trim()) {
            try {
              updateData.tags = JSON.parse(updates.tags);
            } catch {
              updateData.tags = [updates.tags.trim()];
            }
          } else {
            updateData.tags = (updates.tags as any) || [];
          }
        }

        const { error } = await supabase
          .from('events')
          .update(updateData)
          .eq('id', id);

        if (error) {
          console.error('[useEvents] Update error:', error);
          throw error;
        }
      } catch (err) {
        console.error('[useEvents] Exception updating:', err);
        throw err;
      }
    },
    []
  );

  const deleteEvent = useCallback(async (id: string) => {
    const nowMs = Date.now();
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await supabase
        .from('events')
        .update({
          deleted: 1,
          last_modified_ms: nowMs,
          updated_at_ms: nowMs,
        })
        .eq('id', id);
    } catch (err) {
      console.error('[useEvents] Delete error:', err);
    }
  }, []);

  const todayEvents = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const list: CalendarEvent[] = [];

    for (const e of events) {
      const isRecurring = Boolean(
        (e.repeat_rule && e.repeat_rule !== 'none' && e.repeat_rule !== 'null') ||
        (e.recurrence_rule && e.recurrence_rule !== 'none' && e.recurrence_rule !== 'null')
      );

      if (!isRecurring) {
        if (isDateToday(Number(e.start_time_ms))) {
          list.push(e);
        }
      } else {
        const occs = expandOccurrences(e, todayStart, todayEnd);
        for (const occ of occs) {
          list.push({
            ...e,
            start_time_ms: occ.startTimeMs,
            end_time_ms: occ.endTimeMs,
          });
        }
      }
    }

    return list.sort((a, b) => a.start_time_ms - b.start_time_ms);
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    // Project 30 days ahead for recurring events
    const upcomingLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59, 999);

    const list: CalendarEvent[] = [];

    for (const e of events) {
      const isRecurring = Boolean(
        (e.repeat_rule && e.repeat_rule !== 'none' && e.repeat_rule !== 'null') ||
        (e.recurrence_rule && e.recurrence_rule !== 'none' && e.recurrence_rule !== 'null')
      );

      if (!isRecurring) {
        if (Number(e.start_time_ms) >= tomorrowStart.getTime()) {
          list.push(e);
        }
      } else {
        let occs = expandOccurrences(e, tomorrowStart, upcomingLimit);
        // Fallback: If no occurrences in 30 days, check next 365 days and take the next upcoming occurrence
        if (occs.length === 0) {
          const nextYearLimit = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
          const nextOccs = expandOccurrences(e, tomorrowStart, nextYearLimit);
          if (nextOccs.length > 0) {
            occs = [nextOccs[0]];
          }
        }
        for (const occ of occs) {
          list.push({
            ...e,
            start_time_ms: occ.startTimeMs,
            end_time_ms: occ.endTimeMs,
          });
        }
      }
    }

    return list.sort((a, b) => a.start_time_ms - b.start_time_ms);
  }, [events]);

  const pastEvents = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    return events.filter((e) => {
      const isRecurring = Boolean(
        (e.repeat_rule && e.repeat_rule !== 'none' && e.repeat_rule !== 'null') ||
        (e.recurrence_rule && e.recurrence_rule !== 'none' && e.recurrence_rule !== 'null')
      );
      if (isRecurring) return false;
      return Number(e.start_time_ms) < todayStart.getTime() && !isDateToday(Number(e.start_time_ms));
    });
  }, [events]);

  return {
    events,
    todayEvents,
    upcomingEvents,
    pastEvents,
    loading,
    error,
    createEvent,
    updateEvent,
    deleteEvent,
    refresh: fetchEvents,
  };
}

