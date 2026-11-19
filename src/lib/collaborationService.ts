import { supabase } from './supabase';
import type { Database } from '../types/database';

export type CollabTargetType = 'note' | 'folder' | 'reminder' | 'event';
export type CollabRole = 'editor' | 'viewer';
export type ResourceUserRole = 'owner' | 'editor' | 'viewer';

export type ShareInvitation = Database['public']['Tables']['share_invitations']['Row'];
export type CollaborationActivity = Database['public']['Tables']['collaboration_activity']['Row'];

export interface CollaboratorMember {
  collaboration_id: string;
  member_id: string;
  email?: string;
  name: string;
  role: CollabRole;
  joined_at: string | null;
}

async function resolveActorName(): Promise<{ userId: string; actorName: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const actorName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.settings?.userName ||
    (user.email ? user.email.split('@')[0] : 'Usuario');

  return { userId: user.id, actorName };
}

export const CollaborationService = {
  async createInvitation(
    targetType: CollabTargetType,
    targetId: string,
    targetName: string,
    role: CollabRole = targetType === 'reminder' ? 'viewer' : 'editor',
    isPublicMembers = true
  ): Promise<{ invitation: ShareInvitation; inviteUrl: string }> {
    const actor = await resolveActorName();
    if (!actor) {
      throw new Error('Debes iniciar sesión para compartir recursos');
    }

    const payload: Database['public']['Tables']['share_invitations']['Insert'] = {
      owner_id: actor.userId,
      target_type: targetType,
      target_id: targetId,
      target_name: targetName,
      role,
      is_public_members: isPublicMembers,
      status: 'pending',
    };

    const { data, error } = await supabase
      .from('share_invitations')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'No se pudo crear la invitación');
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://veyra-lake.vercel.app';
    const inviteUrl = `${origin}/join?code=${data.invite_code}`;

    this.logActivity(
      targetType,
      targetId,
      'added',
      targetName,
      `${actor.actorName} compartió este elemento`
    ).catch(() => {});

    return { invitation: data, inviteUrl };
  },

  async getActiveInvitations(
    targetType: CollabTargetType,
    targetId: string
  ): Promise<ShareInvitation[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('share_invitations')
      .select('*')
      .eq('owner_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    const now = Date.now();
    return data.filter((inv) => !inv.expires_at || new Date(inv.expires_at).getTime() > now);
  },

  async revokeInvitation(invitationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('share_invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId);

    if (error) {
      throw new Error(error.message || 'No se pudo revocar la invitación');
    }
    return true;
  },

  async getCollaborators(
    targetType: CollabTargetType,
    targetId: string
  ): Promise<CollaboratorMember[]> {
    const { data: collabs, error } = await supabase
      .from('collaborations')
      .select('id, target_type, target_id, owner_id, member_id, role, joined_at')
      .eq('target_type', targetType)
      .eq('target_id', targetId);

    if (error || !collabs || collabs.length === 0) return [];

    const memberIds = collabs.map((c) => c.member_id);
    const nameMap = new Map<string, string>();
    const emailMap = new Map<string, string>();

    try {
      const { data: activities } = await supabase
        .from('collaboration_activity')
        .select('actor_id, actor_name')
        .in('actor_id', memberIds)
        .not('actor_name', 'is', null)
        .order('created_at', { ascending: false });

      if (activities) {
        for (const act of activities) {
          if (act.actor_name && !nameMap.has(act.actor_id)) {
            nameMap.set(act.actor_id, act.actor_name);
            if (act.actor_name.includes('@') && !emailMap.has(act.actor_id)) {
              emailMap.set(act.actor_id, act.actor_name);
            }
          }
        }
      }
    } catch {
      // non-critical
    }

    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', memberIds);

      if (profiles) {
        for (const p of profiles) {
          if (p.email) emailMap.set(p.id, p.email);
        }
      }
    } catch {
      // RLS may limit profile reads
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && memberIds.includes(user.id)) {
      const myName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.settings?.userName ||
        user.email?.split('@')[0];
      if (myName) nameMap.set(user.id, myName);
      if (user.email) emailMap.set(user.id, user.email);
    }

    return collabs.map((c) => {
      const rawName = nameMap.get(c.member_id);
      const email = emailMap.get(c.member_id);
      let displayName = rawName;
      if (displayName && displayName.includes('@')) {
        const prefix = displayName.split('@')[0];
        displayName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      }
      if (!displayName && email && email.includes('@')) {
        const prefix = email.split('@')[0];
        displayName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      }
      if (!displayName) displayName = 'Colaborador';

      return {
        collaboration_id: c.id,
        member_id: c.member_id,
        email,
        name: displayName,
        role: (c.role as CollabRole) || 'editor',
        joined_at: c.joined_at,
      };
    });
  },

  async updateRole(
    collaborationId: string,
    role: CollabRole,
    options?: {
      targetType?: CollabTargetType;
      targetId?: string;
      memberId?: string;
    }
  ): Promise<boolean> {
    let updated = false;

    if (collaborationId) {
      const res = await supabase
        .from('collaborations')
        .update({ role })
        .eq('id', collaborationId)
        .select('id');
      if (!res.error && res.data && res.data.length > 0) {
        updated = true;
      }
    }

    if (!updated && collaborationId) {
      const { error: rpcErr } = await supabase.rpc('update_collaboration_role', {
        p_collaboration_id: collaborationId,
        p_role: role,
      });
      if (!rpcErr) updated = true;
    }

    if (!updated && options?.targetType && options?.targetId && options?.memberId) {
      const { error: rpcErr2 } = await supabase.rpc('update_collaboration_role_by_member', {
        p_target_type: options.targetType,
        p_target_id: options.targetId,
        p_member_id: options.memberId,
        p_role: role,
      });
      if (!rpcErr2) updated = true;
    }

    if (!updated) {
      throw new Error('No se pudo actualizar el rol del colaborador');
    }

    return true;
  },

  async revokeAccess(collaborationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('collaborations')
      .delete()
      .eq('id', collaborationId);

    if (error) {
      throw new Error(error.message || 'No se pudo revocar el acceso');
    }
    return true;
  },

  async leaveCollaboration(targetType: CollabTargetType, targetId: string): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { error } = await supabase
      .from('collaborations')
      .delete()
      .match({ target_type: targetType, target_id: targetId, member_id: user.id });

    if (error) {
      throw new Error(error.message || 'No se pudo abandonar el recurso compartido');
    }
    return true;
  },

  async logActivity(
    targetType: CollabTargetType,
    targetId: string,
    action: 'completed' | 'uncompleted' | 'edited' | 'added' | 'deleted',
    itemTitle?: string,
    details?: string
  ): Promise<void> {
    const actor = await resolveActorName();
    if (!actor) return;

    try {
      await supabase.from('collaboration_activity').insert({
        target_type: targetType,
        target_id: targetId,
        actor_id: actor.userId,
        actor_name: actor.actorName,
        action,
        item_title: itemTitle || null,
        details: details || null,
      });
    } catch (err) {
      console.warn('[CollaborationService] Error logging activity:', err);
    }
  },

  async getActivity(
    targetType: CollabTargetType,
    targetId: string,
    limit = 30
  ): Promise<CollaborationActivity[]> {
    const { data, error } = await supabase
      .from('collaboration_activity')
      .select('*')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data;
  },

  async notifyChange(params: {
    targetType: CollabTargetType;
    targetId: string;
    action: 'completed' | 'uncompleted' | 'edited' | 'added' | 'deleted';
    itemTitle: string;
    details?: string;
  }): Promise<void> {
    try {
      const actor = await resolveActorName();
      if (!actor) return;

      await supabase.functions.invoke('collab-notify', {
        body: {
          targetType: params.targetType,
          targetId: params.targetId,
          actorId: actor.userId,
          actorName: actor.actorName,
          action: params.action,
          itemTitle: params.itemTitle,
          details: params.details,
        },
      });
    } catch (err) {
      console.warn('[CollaborationService] Error invoking collab-notify:', err);
    }
  },

  async getUserRoleForResource(
    targetType: CollabTargetType,
    targetId: string,
    ownerId?: string | null,
    currentUserId?: string | null
  ): Promise<ResourceUserRole> {
    if (!currentUserId) return 'viewer';
    if (ownerId && ownerId === currentUserId) return 'owner';

    try {
      const { data: directCollab } = await supabase
        .from('collaborations')
        .select('owner_id, role')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('member_id', currentUserId)
        .maybeSingle();

      if (directCollab) {
        if (directCollab.owner_id === currentUserId) return 'owner';
        return directCollab.role === 'viewer' ? 'viewer' : 'editor';
      }

      if (targetType === 'note') {
        const { data: noteRow } = await supabase
          .from('notes')
          .select('user_id, folder_id')
          .eq('id', targetId)
          .maybeSingle();

        if (noteRow?.user_id === currentUserId) return 'owner';

        if (noteRow?.folder_id) {
          const { data: folderCollab } = await supabase
            .from('collaborations')
            .select('owner_id, role')
            .eq('target_type', 'folder')
            .eq('target_id', noteRow.folder_id)
            .eq('member_id', currentUserId)
            .maybeSingle();

          if (folderCollab) {
            if (folderCollab.owner_id === currentUserId) return 'owner';
            return folderCollab.role === 'viewer' ? 'viewer' : 'editor';
          }
        }
      }
    } catch (err) {
      console.warn('[CollaborationService] Error checking resource role:', err);
    }

    return ownerId ? 'viewer' : 'owner';
  },
};
