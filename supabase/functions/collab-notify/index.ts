// Supabase Edge Function: collab-notify
// Notifica a los miembros y dueños de un recurso compartido (Móvil vía Expo + Web vía Web Push)

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
  console.warn('[collab-notify] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secret not configured; using fallback keys.');
}

const VAPID_PUBLIC_KEY =
  ENV_VAPID_PUBLIC ||
  'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';
const VAPID_PRIVATE_KEY =
  ENV_VAPID_PRIVATE ||
  'MqjjQWUlfIYV-v911pFFiOYvZqzDWRZ7rr6hbGl8IxY';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@veyra.app';

interface NotifyPayload {
  targetType: 'folder' | 'reminder' | 'note' | 'event';
  targetId: string;
  actorId: string;
  actorName: string;
  action: 'completed' | 'uncompleted' | 'edited' | 'added' | 'deleted';
  itemTitle: string;
  details?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: NotifyPayload = await req.json();
    const { targetType, targetId, actorId, actorName, action, itemTitle, details } = payload;

    if (!targetType || !targetId || !actorId) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: directCollabs, error: collabsError } = await supabase
      .from('collaborations')
      .select('owner_id, member_id')
      .eq('target_type', targetType)
      .eq('target_id', targetId);

    if (collabsError) {
      console.error('[collab-notify] Error fetching collaborations:', collabsError);
    }

    const allCollabs = directCollabs ? [...directCollabs] : [];

    if (targetType === 'note') {
      const { data: noteData } = await supabase
        .from('notes')
        .select('folder_id')
        .eq('id', targetId)
        .maybeSingle();

      if (noteData?.folder_id) {
        const { data: folderCollabs } = await supabase
          .from('collaborations')
          .select('owner_id, member_id')
          .eq('target_type', 'folder')
          .eq('target_id', noteData.folder_id);

        if (folderCollabs) {
          allCollabs.push(...folderCollabs);
        }
      }
    } else if (targetType === 'reminder') {
      const { data: remData } = await supabase
        .from('reminders')
        .select('folder_id')
        .eq('id', targetId)
        .maybeSingle();

      if (remData?.folder_id) {
        const { data: folderCollabs } = await supabase
          .from('collaborations')
          .select('owner_id, member_id')
          .eq('target_type', 'folder')
          .eq('target_id', remData.folder_id);

        if (folderCollabs) {
          allCollabs.push(...folderCollabs);
        }
      }
    }

    const candidateIds = new Set<string>();
    for (const c of allCollabs) {
      if (c.owner_id) candidateIds.add(c.owner_id);
      if (c.member_id) candidateIds.add(c.member_id);
    }
    candidateIds.delete(actorId);
    const recipientIds = Array.from(candidateIds);

    await supabase.from('collaboration_activity').insert({
      target_type: targetType,
      target_id: targetId,
      actor_id: actorId,
      actor_name: actorName || 'Un colaborador',
      action,
      details: details || null,
    });

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No recipients to notify' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const name = actorName || 'Un colaborador';
    const title = itemTitle || 'un elemento';

    let bodyText = `${name} actualizó: ${title}`;
    switch (action) {
      case 'completed':
        bodyText = `${name} completó: "${title}" ✅`;
        break;
      case 'uncompleted':
        bodyText = `${name} reactivó: "${title}" 🔄`;
        break;
      case 'edited': {
        let editSummary = '';
        if (details && typeof details === 'string' && details.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(details);
            if (parsed.summary) editSummary = parsed.summary.toLowerCase();
          } catch {
            // ignore JSON parse error
          }
        }
        bodyText = editSummary ? `${name} ${editSummary} en "${title}" ✏️` : `${name} editó: "${title}" ✏️`;
        break;
      }
      case 'added':
        bodyText = `${name} agregó un nuevo elemento: "${title}" ➕`;
        break;
      case 'deleted':
        bodyText = `${name} eliminó: "${title}" 🗑️`;
        break;
    }

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', recipientIds);

    const validTokens = (tokens || []).map((t) => t.token).filter(Boolean);
    let expoSent = 0;

    if (validTokens.length > 0) {
      const pushMessages = validTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: 'Veyra Colaboración',
        body: bodyText,
        data: {
          targetType,
          targetId,
          action,
        },
      }));

      try {
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(pushMessages),
        });
        if (expoRes.ok) {
          expoSent = pushMessages.length;
        }
      } catch (expoErr) {
        console.error('[collab-notify] Expo send error:', expoErr);
      }
    }

    const { data: webSubs } = await supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', recipientIds);

    let webSent = 0;
    if (webSubs && webSubs.length > 0) {
      const webPayload = JSON.stringify({
        title: 'Veyra Colaboración',
        body: bodyText,
        url:
          targetType === 'reminder'
            ? `/reminders/${targetId}`
            : targetType === 'event'
              ? `/events/${targetId}`
              : `/notes/${targetId}`,
        tag: `collab-${targetType}-${targetId}`,
      });

      for (const sub of webSubs) {
        const res = await sendWebPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          webPayload,
          {
            subject: VAPID_SUBJECT,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          },
          { ttl: 86400, urgency: 'normal' }
        );
        if (res.ok) {
          webSent++;
        } else if (res.expired) {
          await supabase.from('web_push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expoSent,
        webSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    console.error('[collab-notify] Unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
