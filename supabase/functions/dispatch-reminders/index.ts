// Supabase Edge Function: dispatch-reminders
// Ejecutado periódicamente (pg_cron cada minuto o webhook)
// Consulta recordatorios y eventos (incluyendo recurrentes) debidos y envía Web Push con WebCrypto nativo.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { sendWebPushNotification } from '../_shared/webpush.ts';
import { signActionToken } from '../_shared/actionToken.ts';
import { computeDueEventAttempts, computeReminderAttempt } from '../_shared/dispatchLogic.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV_VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const ENV_VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');

if (!ENV_VAPID_PUBLIC || !ENV_VAPID_PRIVATE) {
  console.warn('[dispatch-reminders] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secret not configured; using fallback keys.');
}

const VAPID_PUBLIC_KEY =
  ENV_VAPID_PUBLIC ||
  'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';
const VAPID_PRIVATE_KEY =
  ENV_VAPID_PRIVATE ||
  'MqjjQWUlfIYV-v911pFFiOYvZqzDWRZ7rr6hbGl8IxY';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@veyra.app';

interface UserPushSettings {
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  defaultLeadMinutes: number;
  timezone: string;
}

function parseMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function isWithinQuietHours(nowMs: number, startStr: string, endStr: string, timeZone: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(nowMs));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const curMin = hour * 60 + minute;
    const startMin = parseMinutes(startStr);
    const endMin = parseMinutes(endStr);

    if (startMin === endMin) return false;
    if (startMin > endMin) {
      return curMin >= startMin || curMin < endMin;
    }
    return curMin >= startMin && curMin < endMin;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const nowMs = Date.now();
    const lowerBoundMs = nowMs - 30 * 60 * 1000;
    const maxLeadLookaheadMs = nowMs + 60 * 60 * 1000;

    const userSettingsCache = new Map<string, UserPushSettings>();
    const userSubsCache = new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>();

    const getUserSettings = async (userId: string): Promise<UserPushSettings> => {
      const cached = userSettingsCache.get(userId);
      if (cached) return cached;

      const defaults: UserPushSettings = {
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        defaultLeadMinutes: 0,
        timezone: 'UTC',
      };

      try {
        const { data } = await supabase.auth.admin.getUserById(userId);
        const raw = data?.user?.user_metadata?.settings || {};
        const resolved: UserPushSettings = {
          quietHoursEnabled: Boolean(raw.quietHoursEnabled),
          quietHoursStart: typeof raw.quietHoursStart === 'string' ? raw.quietHoursStart : '22:00',
          quietHoursEnd: typeof raw.quietHoursEnd === 'string' ? raw.quietHoursEnd : '07:00',
          defaultLeadMinutes: typeof raw.defaultLeadMinutes === 'number' ? raw.defaultLeadMinutes : 0,
          timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : 'UTC',
        };
        userSettingsCache.set(userId, resolved);
        return resolved;
      } catch {
        userSettingsCache.set(userId, defaults);
        return defaults;
      }
    };

    const getUserSubs = async (userId: string) => {
      if (userSubsCache.has(userId)) return userSubsCache.get(userId)!;
      const { data: subs } = await supabase
        .from('web_push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId);
      const list = subs || [];
      userSubsCache.set(userId, list);
      return list;
    };

    const sendPushToSubs = async (
      subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
      payloadStr: string,
      urgency: 'very-low' | 'low' | 'normal' | 'high' = 'normal'
    ): Promise<number> => {
      let sent = 0;
      for (const sub of subs) {
        const res = await sendWebPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payloadStr,
          {
            subject: VAPID_SUBJECT,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          },
          { urgency, ttl: 86400 }
        );
        if (res.ok) {
          sent++;
        } else {
          console.warn('[dispatch-reminders] Push delivery failed:', res.status, res.error);
          if (res.expired) {
            await supabase.from('web_push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
      return sent;
    };

    let dispatchedCount = 0;

    // 1. Process pending, non-deleted reminders
    const { data: reminders, error: remError } = await supabase
      .from('reminders')
      .select('id, user_id, title, description, due_date_ms, snooze_until_ms, control_level, offset_minutes')
      .eq('status', 'pending')
      .eq('deleted', 0)
      .or(`due_date_ms.lte.${maxLeadLookaheadMs},snooze_until_ms.lte.${nowMs}`);

    if (remError) {
      console.error('[dispatch-reminders] Error fetching reminders:', remError);
    }

    for (const rem of reminders || []) {
      const settings = await getUserSettings(rem.user_id);
      const match = computeReminderAttempt(
        rem,
        nowMs,
        settings.defaultLeadMinutes,
        lowerBoundMs
      );
      if (!match) continue;

      const { data: existingDelivery } = await supabase
        .from('notification_deliveries')
        .select('id')
        .eq('reminder_id', rem.id)
        .eq('attempt_type', match.deliveryKey)
        .maybeSingle();

      if (existingDelivery) continue;

      const subs = await getUserSubs(rem.user_id);
      if (subs.length === 0) continue;

      const isQuiet =
        settings.quietHoursEnabled &&
        match.level !== 'critical' &&
        isWithinQuietHours(nowMs, settings.quietHoursStart, settings.quietHoursEnd, settings.timezone);

      const actionToken = await signActionToken(
        rem.id,
        nowMs + 24 * 60 * 60 * 1000,
        VAPID_PRIVATE_KEY
      );
      const titlePrefix =
        match.attemptType === 'lead'
          ? `⏰ En ${match.leadMinutes} min: `
          : match.level === 'critical'
            ? '🚨 Urgente: '
            : '';

      const pushPayload = JSON.stringify({
        title: `${titlePrefix}${rem.title}`,
        body: rem.description || 'Recordatorio de Veyra',
        reminderId: rem.id,
        tag: match.tag,
        level: match.level,
        silent: isQuiet,
        actionToken,
      });

      const urgency = match.level === 'critical' ? 'high' : 'normal';
      const sent = await sendPushToSubs(subs, pushPayload, urgency);
      dispatchedCount += sent;

      if (sent > 0) {
        await supabase.from('notification_deliveries').insert({
          reminder_id: rem.id,
          user_id: rem.user_id,
          attempt_type: match.deliveryKey,
        });
      }
    }

    // 2. Process upcoming and recurring non-deleted calendar events
    const maxEventLookaheadMs = nowMs + 7 * 24 * 60 * 60 * 1000;
    const { data: events, error: evError } = await supabase
      .from('events')
      .select(
        'id, user_id, title, description, location, start_time_ms, end_time_ms, is_all_day, all_day_date, timezone, repeat_rule, recurrence_rule, notification_offset_min, notification_offsets'
      )
      .eq('deleted', 0)
      .or(
        `and(start_time_ms.gte.${nowMs - 15 * 60 * 1000},start_time_ms.lte.${maxEventLookaheadMs}),repeat_rule.not.is.null,recurrence_rule.not.is.null`
      );

    if (evError) {
      console.error('[dispatch-reminders] Error fetching events:', evError);
    }

    for (const ev of events || []) {
      const settings = await getUserSettings(ev.user_id);
      const subs = await getUserSubs(ev.user_id);
      if (subs.length === 0) continue;

      const tz = ev.timezone || settings.timezone || 'UTC';
      const isQuiet =
        settings.quietHoursEnabled &&
        isWithinQuietHours(nowMs, settings.quietHoursStart, settings.quietHoursEnd, tz);

      const matches = computeDueEventAttempts(
        {
          ...ev,
          timezone: tz,
        },
        nowMs,
        settings.defaultLeadMinutes || 15,
        lowerBoundMs
      );

      for (const match of matches) {
        const { data: existingEvDelivery } = await supabase
          .from('event_notification_deliveries')
          .select('id')
          .eq('event_id', ev.id)
          .eq('attempt_key', match.attemptKey)
          .maybeSingle();

        if (existingEvDelivery) continue;

        const pushPayload = JSON.stringify({
          title: match.title,
          body: match.body,
          url: `/events/${ev.id}`,
          tag: match.tag,
          level: 'normal',
          silent: isQuiet,
        });

        const sent = await sendPushToSubs(subs, pushPayload, 'normal');
        dispatchedCount += sent;

        if (sent > 0) {
          await supabase.from('event_notification_deliveries').insert({
            event_id: ev.id,
            user_id: ev.user_id,
            attempt_key: match.attemptKey,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        dispatched: dispatchedCount,
        processedReminders: (reminders || []).length,
        processedEvents: (events || []).length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    console.error('[dispatch-reminders] Fatal:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
