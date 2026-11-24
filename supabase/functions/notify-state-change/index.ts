// Supabase Edge Function: notify-state-change
// Disparada por Database Webhook / Trigger en la tabla 'reminders'
// Notifica a los demás dispositivos para que cierren la notificación al instante ("Completar en un lado cierra todos")

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { sendWebPushNotification } from '../_shared/webpush.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV_VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const ENV_VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');

if (!ENV_VAPID_PUBLIC || !ENV_VAPID_PRIVATE) {
  console.warn('[notify-state-change] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secret not configured; using fallback keys.');
}

const VAPID_PUBLIC_KEY =
  ENV_VAPID_PUBLIC ||
  'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';
const VAPID_PRIVATE_KEY =
  ENV_VAPID_PRIVATE ||
  'MqjjQWUlfIYV-v911pFFiOYvZqzDWRZ7rr6hbGl8IxY';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@veyra.app';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const record = body.record;
    const oldRecord = body.old_record;

    if (!record) {
      return new Response(JSON.stringify({ error: 'No record provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reminderId = record.id;
    const userId = record.user_id;
    const status = record.status;
    const isCompleted = status === 'completed';
    const isDeleted = record.deleted === 1;
    const isSnoozed =
      record.snooze_until_ms &&
      (!oldRecord || record.snooze_until_ms !== oldRecord.snooze_until_ms);

    if (!isCompleted && !isDeleted && !isSnoozed) {
      return new Response(JSON.stringify({ message: 'No dismiss needed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Silent dismiss push a suscripciones Web Push del usuario
    const { data: webSubs } = await supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);

    let webDismissed = 0;
    if (webSubs && webSubs.length > 0) {
      const dismissPayload = JSON.stringify({
        type: 'dismiss',
        reminderId,
      });

      for (const sub of webSubs) {
        const res = await sendWebPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          dismissPayload,
          {
            subject: VAPID_SUBJECT,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          },
          { ttl: 300, urgency: 'low' }
        );
        if (res.ok) {
          webDismissed++;
        } else if (res.expired) {
          await supabase.from('web_push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    // 2. Silent push a Expo (móvil) con data payload { type: 'dismiss', reminderId }
    const { data: pushTokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId);

    let mobileDismissed = 0;
    const validTokens = (pushTokens || []).map((t) => t.token).filter(Boolean);

    if (validTokens.length > 0) {
      const expoMessages = validTokens.map((token) => ({
        to: token,
        _contentAvailable: true,
        data: {
          type: 'dismiss',
          reminderId,
        },
      }));

      try {
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(expoMessages),
        });
        if (expoRes.ok) {
          mobileDismissed = expoMessages.length;
        }
      } catch (expoErr) {
        console.error('[notify-state-change] Expo dismiss error:', expoErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reminderId,
        webDismissed,
        mobileDismissed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    console.error('[notify-state-change] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
