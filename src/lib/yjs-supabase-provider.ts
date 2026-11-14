import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { uint8ArrayToBase64, computeSha256 } from './crypto-utils';
import type { CollabUser } from '../types/notes';

export interface YjsSupabaseProviderOptions {
  noteId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  syncMode?: 'yjs' | 'rest';
  initialServerClock?: number;
  currentUser: {
    id: string;
    email: string;
    name: string;
    color: string;
  };
  onAwarenessChange?: (users: CollabUser[]) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
}

export class YjsSupabaseProvider {
  public noteId: string;
  public doc: Y.Doc;
  public awareness: awarenessProtocol.Awareness;
  public channel: RealtimeChannel | null = null;
  public clientId: string;
  public status: 'connecting' | 'connected' | 'disconnected' = 'connecting';
  private options: YjsSupabaseProviderOptions;
  private isDestroyed = false;
  private awarenessHeartbeatInterval: number | null = null;
  private catchUpInterval: number | null = null;
  private lastProcessedReadId = 0;
  private isCatchingUp = false;

  constructor(options: YjsSupabaseProviderOptions) {
    this.options = options;
    this.noteId = options.noteId;
    this.doc = options.doc;
    this.awareness = options.awareness;
    this.clientId = 'web-' + crypto.randomUUID();
    this.lastProcessedReadId = options.initialServerClock || 0;

    console.log('[AWARENESS-TRACE-WEB-V2] Provider inicializado', {
      noteId: this.noteId,
      clientId: this.clientId,
      awarenessClientID: this.awareness.clientID,
      status: this.status,
      initialClock: this.lastProcessedReadId,
    });

    // Ensure local user metadata is updated in Awareness
    const displayName =
      options.currentUser.name || options.currentUser.email.split('@')[0] || 'Usuario';
    this.awareness.setLocalStateField('user', {
      id: options.currentUser.id || null,
      userId: options.currentUser.id || null,
      name: `${displayName} • PC`,
      color: options.currentUser.color || '#00D2D3',
      isEditing: true,
    });

    this.init();
    this.setupWindowListeners();
  }

  private async init() {
    this.setStatus('connecting');

    // Subscribe to local doc updates to persist via RPC and broadcast
    this.doc.on('update', this.handleLocalDocUpdate);

    // Exact mobile specification channel: note_yjs_${noteId}
    const channelName = `note_yjs_${this.noteId}`;
    console.log(`🔌 [Yjs Realtime Provider] Conectando a canal: ${channelName}`);

    // Asegurar autenticación del socket antes de unirse al canal privado
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
    } catch (authErr) {
      console.warn('⚠️ [Yjs Realtime Provider] Error configurando auth de realtime:', authErr);
    }

    if (this.isDestroyed) return;

    // Clean up any lingering channel with this topic before creating a new one
    const existing = supabase
      .getChannels()
      .find((ch) => ch.subTopic === channelName || ch.topic === `realtime:${channelName}`);
    if (existing) {
      console.log(`♻️ [Yjs Realtime Provider] Limpiando canal previo existente: ${channelName}`);
      supabase.removeChannel(existing);
    }

    this.channel = supabase.channel(channelName, {
      config: {
        private: true,
        broadcast: { self: false, ack: false },
        presence: { key: this.clientId },
      },
    });

    // 1. Escuchar cambios locales de awareness para enviarlos al móvil
    this.awareness.on('update', this.handleLocalAwarenessUpdate);

    // 2. Recibir los cursores y presencia de Awareness enviados por el móvil
    this.channel
      .on('broadcast', { event: 'AWARENESS_UPDATE' }, ({ payload }) => {
        if (this.isDestroyed) return;
        if (!payload || payload.senderClientId === this.clientId) return;
        if (typeof payload.update === 'string') {
          try {
            const bytes = Uint8Array.from(window.atob(payload.update), (c) => c.charCodeAt(0));
            awarenessProtocol.applyAwarenessUpdate(this.awareness, bytes, 'remote');
          } catch (err) {
            console.error('❌ [Yjs Awareness] Error aplicando awareness update:', err);
          }
        }
      })
      .on('broadcast', { event: 'YJS_UPDATE' }, ({ payload }) => {
        if (this.isDestroyed) return;
        if (!payload || payload.senderClientId === this.clientId || payload.senderId === this.clientId) return;

        if (typeof payload.update === 'string') {
          try {
            const bytes = Uint8Array.from(window.atob(payload.update), (c) => c.charCodeAt(0));
            console.log(
              `📥 [Yjs Realtime] Recibido delta remoto vía WebSocket (${bytes.byteLength} bytes) de ${
                payload.senderClientId || payload.senderId || 'móvil'
              }`
            );
            // Apply update to Y.Doc with origin 'remote-broadcast' so Tiptap renders it immediately without re-broadcasting
            Y.applyUpdate(this.doc, bytes, 'remote-broadcast');
          } catch (err) {
            console.error('❌ [Yjs Realtime] Error aplicando broadcast recibido:', err);
          }
        }
      })
      .on('presence', { event: 'sync' }, () => {
        if (this.isDestroyed || !this.channel) return;
        const presenceState = this.channel.presenceState();
        const users: CollabUser[] = [];

        Object.entries(presenceState).forEach(([clientId, states]) => {
          if (states && states.length > 0) {
            const data = states[0] as unknown as { user?: { id: string; name: string; color: string } };
            if (data?.user) {
              users.push({
                clientId,
                userId: data.user.id,
                name: data.user.name,
                color: data.user.color,
              });
            }
          }
        });

        console.log(`👥 [Yjs Awareness] Colaboradores presentes (${users.length}):`, users.map((u) => u.name));
        this.options.onAwarenessChange?.(users);
      })
      .subscribe(async (status) => {
        console.log(`📡 [Yjs Realtime] Estado de suscripción en "${channelName}":`, status);
        if (status === 'SUBSCRIBED') {
          this.setStatus('connected');

          // Catch-up inmediato de cualquier delta que haya llegado a Supabase mientras nos conectábamos
          this.catchUpRemoteUpdates();

          // Transmitir estado inicial de awareness local inmediatamente al unirse al canal
          try {
            const updateBytes = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
            const base64Awareness = uint8ArrayToBase64(updateBytes);
            const sendPromise = this.channel?.send({
              type: 'broadcast',
              event: 'AWARENESS_UPDATE',
              payload: {
                senderClientId: this.clientId,
                update: base64Awareness,
                timestamp: Date.now(),
              },
            });
            sendPromise?.catch((err) => {
              console.error('❌ [Yjs Awareness] Error transmitiendo broadcast inicial:', err);
            });
          } catch (e) {
            console.warn('⚠️ [Yjs Awareness] Error codificando broadcast inicial:', e);
          }

          // Track presence
          const displayName =
            this.options.currentUser.name || this.options.currentUser.email.split('@')[0] || 'Usuario';
          await this.channel?.track({
            user: {
              id: this.options.currentUser.id,
              name: `${displayName} • PC`,
              color: '#00D2D3',
            },
            onlineAt: new Date().toISOString(),
          });
          console.log(`✨ [Yjs Realtime] Presencia registrada como: ${displayName} • PC`);

          // Start periodic awareness heartbeat (every 4s) to prevent mobile watchdog from purging PC cursor
          if (this.awarenessHeartbeatInterval) {
            window.clearInterval(this.awarenessHeartbeatInterval);
          }
          this.awarenessHeartbeatInterval = window.setInterval(() => {
            if (this.isDestroyed || !this.channel || this.status !== 'connected') return;
            try {
              if (this.awareness.getLocalState() !== null) {
                const hbBytes = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
                const base64Awareness = uint8ArrayToBase64(hbBytes);
                const sendPromise = this.channel.send({
                  type: 'broadcast',
                  event: 'AWARENESS_UPDATE',
                  payload: {
                    senderClientId: this.clientId,
                    update: base64Awareness,
                    timestamp: Date.now(),
                  },
                });
                sendPromise?.catch((err) => {
                  console.error('❌ [Yjs Awareness] Error en heartbeat broadcast:', err);
                });
              }
            } catch (_) {}
          }, 4000);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.setStatus('disconnected');
        }
      });

    // Iniciar intervalo de sincronización catch-up continuo (cada 2.5s)
    if (this.catchUpInterval) {
      window.clearInterval(this.catchUpInterval);
    }
    this.catchUpInterval = window.setInterval(() => {
      if (!this.isDestroyed) {
        this.catchUpRemoteUpdates();
      }
    }, 2500);
  }

  public async catchUpRemoteUpdates(): Promise<void> {
    if (this.isCatchingUp || this.isDestroyed) return;
    this.isCatchingUp = true;
    try {
      const { data: updates, error } = await supabase
        .from('note_yjs_updates')
        .select('id, update_data, client_id')
        .eq('note_id', this.noteId)
        .gt('id', this.lastProcessedReadId)
        .order('id', { ascending: true });

      if (error) {
        console.warn('⚠️ [Yjs Realtime Provider] Error en catch-up:', error);
        return;
      }

      if (updates && updates.length > 0) {
        console.log(`📦 [Yjs Realtime Provider] Catch-up: aplicando ${updates.length} deltas remotos`);
        for (const u of updates) {
          if (u.id > this.lastProcessedReadId) {
            this.lastProcessedReadId = u.id;
          }
          if (u.client_id === this.clientId) {
            continue;
          }
          try {
            const bytes = Uint8Array.from(window.atob(u.update_data), (c) => c.charCodeAt(0));
            Y.applyUpdate(this.doc, bytes, 'remote-catchup');
          } catch (err) {
            console.error('❌ [Yjs CatchUp] Error aplicando update id', u.id, err);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ [Yjs CatchUp] Excepción en catchUpRemoteUpdates:', e);
    } finally {
      this.isCatchingUp = false;
    }
  }

  private handleWindowFocus = () => {
    if (!this.isDestroyed) {
      this.catchUpRemoteUpdates();
    }
  };

  private setupWindowListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.handleWindowFocus);
      document.addEventListener('visibilitychange', this.handleWindowFocus);
    }
  }

  private handleLocalAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === 'remote') return;
    const changedClients = added.concat(updated, removed);
    const updateBytes = awarenessProtocol.encodeAwarenessUpdate(
      this.awareness,
      changedClients.length > 0 ? changedClients : [this.awareness.clientID]
    );
    const base64Awareness = uint8ArrayToBase64(updateBytes);

    if (this.channel && this.status === 'connected') {
      const sendPromise = this.channel.send({
        type: 'broadcast',
        event: 'AWARENESS_UPDATE',
        payload: {
          senderClientId: this.clientId,
          update: base64Awareness,
          timestamp: Date.now(),
        },
      });
      sendPromise?.catch((err) => {
        console.error('❌ [Yjs Awareness] Error transmitiendo broadcast de cursor:', err);
      });
    } else {
      console.warn('⚠️ [Yjs Awareness] Descartado: canal no conectado', {
        hasChannel: Boolean(this.channel),
        status: this.status,
      });
    }
  };

  private handleLocalDocUpdate = async (update: Uint8Array, origin: unknown) => {
    // Only persist and broadcast local user changes (ignore remote updates)
    if (
      origin === 'remote-broadcast' ||
      origin === 'remote-snapshot' ||
      origin === 'remote-update' ||
      origin === 'remote-catchup'
    ) {
      return;
    }

    const base64Update = uint8ArrayToBase64(update);
    const hashHex = await computeSha256(update);

    console.log(
      `📤 [Yjs Local Update] Delta local generado (${update.byteLength} bytes). Modo: ${this.options.syncMode || 'yjs'}`
    );

    // 1. Persist delta via authoritative Supabase RPC only for notes configured in 'yjs' mode
    if (this.options.syncMode !== 'rest') {
      try {
        const { data, error } = await supabase.rpc('append_note_yjs_update', {
          p_note_id: this.noteId,
          p_client_id: this.clientId,
          p_update_data: base64Update,
          p_update_hash: hashHex,
        });

        if (error) {
          console.error('❌ [Yjs RPC Error] append_note_yjs_update falló:', error);
        } else {
          console.log('✅ [Yjs RPC Success] append_note_yjs_update guardado:', data);
          if (typeof data === 'number' && data > this.lastProcessedReadId) {
            this.lastProcessedReadId = data;
          }
        }
      } catch (err) {
        console.error('❌ [Yjs RPC Exception]:', err);
      }
    }

    // 2. Broadcast via WebSocket channel note_yjs_${noteId} with YJS_UPDATE event
    if (this.channel && this.status === 'connected') {
      this.channel.send({
        type: 'broadcast',
        event: 'YJS_UPDATE',
        payload: {
          senderClientId: this.clientId,
          update: base64Update,
          timestamp: Date.now(),
        },
      });
      console.log(`⚡ [Yjs Broadcast] Delta emitido vía WebSocket a note_yjs_${this.noteId}`);
    }
  };

  private setStatus(status: 'connecting' | 'connected' | 'disconnected') {
    this.status = status;
    this.options.onStatusChange?.(status);
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.awarenessHeartbeatInterval) {
      window.clearInterval(this.awarenessHeartbeatInterval);
      this.awarenessHeartbeatInterval = null;
    }
    if (this.catchUpInterval) {
      window.clearInterval(this.catchUpInterval);
      this.catchUpInterval = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handleWindowFocus);
      document.removeEventListener('visibilitychange', this.handleWindowFocus);
    }
    this.doc.off('update', this.handleLocalDocUpdate);
    this.awareness.off('update', this.handleLocalAwarenessUpdate);
    if (this.channel) {
      console.log(`🛑 [Yjs Realtime Provider] Destruyendo canal y presencia de note_yjs_${this.noteId}`);
      this.channel.untrack();
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.setStatus('disconnected');
  }
}
