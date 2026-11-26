import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import {
  expandOccurrences,
  parseRecurrenceRule,
  formatYmd,
} from '../services/recurrence/recurrenceEngine';
import { localDB } from '../lib/db/local-db';
import { syncEngine } from '../lib/sync/syncEngine';
import { extractHashtags, syncItemTags } from '../lib/tagUtils';

export type CalendarEvent = Database['public']['Tables']['events']['Row'];

export function useEvents(userId?: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Initial instant load from IndexedDB (0 ms offline start)
  useEffect(() => {
    let isMounted = true;
    localDB.events
      .filter((e) => e.deleted === 0)
      .sortBy('start_time_ms')
      .then((cached) => {
        if (isMounted && cached.length > 0) {
          setEvents(cached);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[useEvents] Error reading from localDB:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  // 2. Fetch events from Supabase or fallback to localDB
  const fetchEvents = useCallback(async () => {
    if (!userId) return;
    try {
      if (!syncEngine.isOnline()) {
        const cached = await localDB.events
          .filter((e) => e.deleted === 0)
          .sortBy('start_time_ms');
        setEvents(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
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

      if (mapped.length > 0) {
        await localDB.events.bulkPut(mapped);
      }
      setEvents(mapped);
    } catch (err: unknown) {
      console.error('[useEvents] Error fetching:', err);
      setError((err as Error).message);
      const cached = await localDB.events
        .filter((e) => e.deleted === 0)
        .sortBy('start_time_ms');
      if (cached.length > 0) {
        setEvents(cached);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // 3. Real-time subscription for events
  useEffect(() => {
    if (!userId) return;

    const channelName = `events-changes-${userId}-${Math.random().toString(36).substring(2, 8)}`;
    const channel = supabase
      .channel(channelName, { config: { private: true } })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
        },
        async (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            const raw = newRecord as CalendarEvent;
            if (raw.deleted === 1) {
              await localDB.events.delete(raw.id);
              setEvents((prev) => prev.filter((e) => e.id !== raw.id));
              return;
            }
            const item: CalendarEvent = {
              ...raw,
              start_time_ms: Number(raw.start_time_ms),
              end_time_ms: Number(raw.end_time_ms),
            };
            await localDB.events.put(item);
            setEvents((prev) => {
              if (prev.some((e) => e.id === item.id)) {
                return prev.map((e) => (e.id === item.id ? item : e));
              }
              return [...prev, item].sort((a, b) => a.start_time_ms - b.start_time_ms);
            });
          }

          if (eventType === 'UPDATE') {
            const raw = newRecord as CalendarEvent;
            if (raw.deleted === 1) {
              await localDB.events.delete(raw.id);
              setEvents((prev) => prev.filter((e) => e.id !== raw.id));
              return;
            }
            const updated: CalendarEvent = {
              ...raw,
              start_time_ms: Number(raw.start_time_ms),
              end_time_ms: Number(raw.end_time_ms),
            };
            await localDB.events.put(updated);
            setEvents((prev) =>
              prev
                .map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
                .sort((a, b) => a.start_time_ms - b.start_time_ms)
            );
          }

          if (eventType === 'DELETE') {
            if (oldRecord && oldRecord.id) {
              await localDB.events.delete(oldRecord.id);
              setEvents((prev) => prev.filter((e) => e.id !== oldRecord.id));
            }
          }
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
      attachments?: string | null;
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
        attachments: payload.attachments || null,
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
        attachments: payload.attachments || null,
        created_at_ms: nowMs,
        updated_at_ms: nowMs,
        last_modified_ms: nowMs,
      };

      // 1. In-memory
      setEvents((prev) => [...prev, newEvent].sort((a, b) => a.start_time_ms - b.start_time_ms));

      // 2. Local IndexedDB
      await localDB.events.put(newEvent);

      // 3. Outbox
      await syncEngine.enqueue('events', 'upsert', newId, insertData, nowMs);

      const allEventTags = Array.from(
        new Set([
          ...parsedTags,
          ...extractHashtags(`${payload.title} ${payload.description || ''}`),
        ])
      );
      if (allEventTags.length > 0) {
        syncItemTags(userId, 'event', newId, allEventTags).catch(() => {});
      }

      return newId;
    },
    [userId]
  );

  const updateEvent = useCallback(
    async (id: string, updates: Partial<CalendarEvent>) => {
      const nowMs = Date.now();

      // 1. In-memory
      setEvents((prev) =>
        prev
          .map((e) =>
            e.id === id
              ? { ...e, ...updates, updated_at_ms: nowMs, last_modified_ms: nowMs }
              : e
          )
          .sort((a, b) => a.start_time_ms - b.start_time_ms)
      );

      // 2. Local IndexedDB & payload
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
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.is_all_day !== undefined) updateData.is_all_day = updates.is_all_day;
      if (updates.all_day_date !== undefined) updateData.all_day_date = updates.all_day_date;
      if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
      if (updates.is_birthday_like !== undefined) updateData.is_birthday_like = updates.is_birthday_like;
      if (updates.notification_offset_min !== undefined) updateData.notification_offset_min = updates.notification_offset_min;
      if (updates.notification_offsets !== undefined) updateData.notification_offsets = updates.notification_offsets;
      if (updates.attachments !== undefined) updateData.attachments = updates.attachments;

      await localDB.events.update(id, updateData);

      // 3. Outbox
      await syncEngine.enqueue('events', 'upsert', id, updateData, nowMs);

      if (updates.tags !== undefined || updates.title !== undefined || updates.description !== undefined) {
        const currentLocal = await localDB.events.get(id);
        const rawTags = updates.tags !== undefined ? updates.tags : currentLocal?.tags;
        const explicitTags = Array.isArray(rawTags) ? rawTags.map(String) : [];
        const allEventTags = Array.from(
          new Set([
            ...explicitTags,
            ...extractHashtags(`${updates.title ?? currentLocal?.title ?? ''} ${updates.description ?? currentLocal?.description ?? ''}`),
          ])
        );
        syncItemTags(userId, 'event', id, allEventTags).catch(() => {});
      }
    },
    [userId]
  );

  const deleteEvent = useCallback(async (id: string) => {
    const nowMs = Date.now();

    // 1. In-memory
    setEvents((prev) => prev.filter((e) => e.id !== id));

    // 2. Local IndexedDB
    await localDB.events.update(id, {
      deleted: 1,
      last_modified_ms: nowMs,
      updated_at_ms: nowMs,
    });

    // 3. Outbox
    await syncEngine.enqueue('events', 'delete', id, null, nowMs);
  }, []);

  const restoreEvent = useCallback(async (id: string) => {
    const nowMs = Date.now();

    await localDB.events.update(id, {
      deleted: 0,
      last_modified_ms: nowMs,
      updated_at_ms: nowMs,
    });

    const restored = await localDB.events.get(id);
    if (restored) {
      setEvents((prev) => {
        if (prev.some((e) => e.id === id)) return prev;
        return [...prev, restored as CalendarEvent];
      });
      await syncEngine.enqueue(
        'events',
        'upsert',
        id,
        {
          deleted: 0,
          last_modified_ms: nowMs,
          updated_at_ms: nowMs,
        },
        nowMs
      );
    }
  }, []);

  const todayEvents = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayStartMs = todayStart.getTime();
    const todayEndMs = todayEnd.getTime();
    const todayYmd = formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const list: CalendarEvent[] = [];

    for (const e of events) {
      const rule = parseRecurrenceRule(e.recurrence_rule || e.repeat_rule);

      if (rule.type === 'none') {
        if (e.is_all_day && e.all_day_date) {
          if (e.all_day_date === todayYmd) {
            list.push(e);
          }
        } else {
          const sMs = Number(e.start_time_ms);
          const eMs = Number(e.end_time_ms || e.start_time_ms);
          if (eMs >= todayStartMs && sMs <= todayEndMs) {
            list.push(e);
          }
        }
      } else {
        const occurrences = expandOccurrences(
          {
            id: e.id,
            start_time_ms: Number(e.start_time_ms),
            end_time_ms: Number(e.end_time_ms),
            repeat_rule: e.repeat_rule,
            recurrence_rule: e.recurrence_rule,
            timezone: e.timezone,
            is_all_day: e.is_all_day,
            all_day_date: e.all_day_date,
          },
          todayStart,
          todayEnd
        );

        if (occurrences.length > 0) {
          const firstOcc = occurrences[0];
          list.push({
            ...e,
            start_time_ms: firstOcc.startTimeMs,
            end_time_ms: firstOcc.endTimeMs,
          });
        }
      }
    }

    return list.sort((a, b) => Number(a.start_time_ms) - Number(b.start_time_ms));
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const todayEndMs = tomorrowStart.getTime() - 1;
    const todayYmd = formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const list: CalendarEvent[] = [];

    for (const e of events) {
      const rule = parseRecurrenceRule(e.recurrence_rule || e.repeat_rule);

      if (rule.type === 'none') {
        if (e.is_all_day && e.all_day_date) {
          if (e.all_day_date > todayYmd) {
            list.push(e);
          }
        } else if (Number(e.start_time_ms) > todayEndMs) {
          list.push(e);
        }
      } else {
        const horizonYears = rule.type === 'yearly' ? Math.max(2, (rule.interval || 1) + 1) : 1;
        const horizonEnd = new Date(
          now.getFullYear() + horizonYears,
          now.getMonth(),
          now.getDate() + 7,
          23,
          59,
          59,
          999
        );
        const occurrences = expandOccurrences(
          {
            id: e.id,
            start_time_ms: Number(e.start_time_ms),
            end_time_ms: Number(e.end_time_ms),
            repeat_rule: e.repeat_rule,
            recurrence_rule: e.recurrence_rule,
            timezone: e.timezone,
            is_all_day: e.is_all_day,
            all_day_date: e.all_day_date,
          },
          tomorrowStart,
          horizonEnd
        );

        const nextOcc = occurrences.find((occ) => occ.startTimeMs > todayEndMs);
        if (nextOcc) {
          list.push({
            ...e,
            start_time_ms: nextOcc.startTimeMs,
            end_time_ms: nextOcc.endTimeMs,
          });
        } else if (Number(e.start_time_ms) > todayEndMs) {
          list.push(e);
        }
      }
    }

    return list.sort((a, b) => Number(a.start_time_ms) - Number(b.start_time_ms));
  }, [events]);

  const pastEvents = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const todayYmd = formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());

    return events
      .filter((e) => {
        const rule = parseRecurrenceRule(e.recurrence_rule || e.repeat_rule);
        if (rule.type !== 'none') return false;
        if (e.is_all_day && e.all_day_date) {
          return e.all_day_date < todayYmd;
        }
        return Number(e.end_time_ms || e.start_time_ms) < todayStartMs;
      })
      .sort((a, b) => Number(b.start_time_ms) - Number(a.start_time_ms));
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
    restoreEvent,
    refresh: fetchEvents,
  };
}
