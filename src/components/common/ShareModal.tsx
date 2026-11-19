import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  Link as LinkIcon,
  Copy,
  Check,
  Users,
  Activity,
  Trash2,
  Loader2,
  Shield,
  LogOut,
  Plus,
  Eye,
  Edit3,
  Crown,
} from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import {
  CollaborationService,
  type CollabRole,
  type CollabTargetType,
  type CollaboratorMember,
  type CollaborationActivity,
  type ShareInvitation,
} from '../../lib/collaborationService';

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: CollabTargetType;
  targetId: string;
  targetName: string;
  ownerId?: string | null;
  currentUserId?: string | null;
  onLeftCollaboration?: () => void;
}

type ShareTab = 'link' | 'members' | 'activity';

const TARGET_TYPE_LABEL: Record<CollabTargetType, string> = {
  note: 'Nota',
  folder: 'Carpeta',
  reminder: 'Recordatorio',
  event: 'Evento',
};

const ACTION_LABEL: Record<string, string> = {
  added: 'compartió o se unió',
  edited: 'editó',
  completed: 'completó',
  uncompleted: 'reactivó',
  deleted: 'eliminó',
};

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName,
  ownerId,
  currentUserId,
  onLeftCollaboration,
}) => {
  const [activeTab, setActiveTab] = useState<ShareTab>('link');
  const [selectedRole, setSelectedRole] = useState<CollabRole>(
    targetType === 'reminder' ? 'viewer' : 'editor'
  );
  const [invitations, setInvitations] = useState<ShareInvitation[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorMember[]>([]);
  const [activities, setActivities] = useState<CollaborationActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(currentUserId || null);

  useEffect(() => {
    if (currentUserId) {
      setResolvedUserId(currentUserId);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setResolvedUserId(data.user?.id || null);
    });
  }, [currentUserId]);

  const effectiveUserId = currentUserId || resolvedUserId;
  const isOwner = !ownerId || !effectiveUserId || ownerId === effectiveUserId;

  const loadAll = useCallback(async () => {
    if (!isOpen || !targetId) return;
    setLoading(true);
    try {
      const [invs, members, acts] = await Promise.all([
        isOwner ? CollaborationService.getActiveInvitations(targetType, targetId) : Promise.resolve([]),
        CollaborationService.getCollaborators(targetType, targetId),
        CollaborationService.getActivity(targetType, targetId, 30),
      ]);
      setInvitations(invs);
      setCollaborators(members);
      setActivities(acts);
    } catch (err) {
      console.warn('[ShareModal] Error loading sharing state:', err);
    } finally {
      setLoading(false);
    }
  }, [isOpen, targetType, targetId, isOwner]);

  useEffect(() => {
    if (isOpen) {
      setSelectedRole(targetType === 'reminder' ? 'viewer' : 'editor');
      loadAll();
    }
  }, [isOpen, targetType, targetId, loadAll]);

  const handleCopy = async (text: string, id: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success(`${label} copiado al portapapeles`);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
    } catch {
      toast.error('No se pudo copiar al portapapeles');
    }
  };

  const handleCreateInvitation = async () => {
    setCreating(true);
    try {
      const { invitation, inviteUrl } = await CollaborationService.createInvitation(
        targetType,
        targetId,
        targetName || TARGET_TYPE_LABEL[targetType],
        selectedRole,
        true
      );
      setInvitations((prev) => [invitation, ...prev]);
      await handleCopy(inviteUrl, `url-${invitation.id}`, 'Enlace de invitación');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al generar invitación');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    try {
      await CollaborationService.revokeInvitation(id);
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      toast.success('Invitación revocada');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al revocar invitación');
    }
  };

  const handleRoleChange = async (member: CollaboratorMember, newRole: CollabRole) => {
    setUpdatingMemberId(member.collaboration_id);
    try {
      await CollaborationService.updateRole(member.collaboration_id, newRole, {
        targetType,
        targetId,
        memberId: member.member_id,
      });
      setCollaborators((prev) =>
        prev.map((m) =>
          m.collaboration_id === member.collaboration_id ? { ...m, role: newRole } : m
        )
      );
      toast.success(`Permiso actualizado a ${newRole === 'editor' ? 'Editor' : 'Lector'}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el rol');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemoveMember = async (member: CollaboratorMember) => {
    setUpdatingMemberId(member.collaboration_id);
    try {
      await CollaborationService.revokeAccess(member.collaboration_id);
      setCollaborators((prev) =>
        prev.filter((m) => m.collaboration_id !== member.collaboration_id)
      );
      toast.success(`Se quitó el acceso a ${member.name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo quitar al miembro');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleLeave = async () => {
    try {
      await CollaborationService.leaveCollaboration(targetType, targetId);
      toast.success('Has salido del recurso compartido');
      onLeftCollaboration?.();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abandonar el recurso');
    }
  };

  const buildJoinUrl = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://veyra-lake.vercel.app';
    return `${origin}/join?code=${code}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Compartir ${TARGET_TYPE_LABEL[targetType]}`}
      description={targetName || 'Elemento de Veyra'}
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs">
        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-veyra-card border border-veyra-border">
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium transition-colors cursor-pointer',
              activeTab === 'link'
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Invitación</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium transition-colors cursor-pointer',
              activeTab === 'members'
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Miembros ({collaborators.length + 1})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium transition-colors cursor-pointer',
              activeTab === 'activity'
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Actividad</span>
          </button>
        </div>

        {/* Tab 1: Invitations */}
        {activeTab === 'link' && (
          <div className="space-y-4">
            {isOwner ? (
              <>
                <div className="p-3.5 rounded-lg bg-veyra-card/70 border border-veyra-border space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider mb-1.5">
                      Permiso para quienes se unan
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('editor')}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors cursor-pointer',
                          selectedRole === 'editor'
                            ? 'bg-accent/15 border-accent text-veyra-text'
                            : 'bg-veyra-elevated/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                        )}
                      >
                        <Edit3 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <p className="font-semibold text-xs">Editor</p>
                          <p className="text-[10px] text-veyra-muted">Puede ver y editar</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedRole('viewer')}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors cursor-pointer',
                          selectedRole === 'viewer'
                            ? 'bg-accent/15 border-accent text-veyra-text'
                            : 'bg-veyra-elevated/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                        )}
                      >
                        <Eye className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                          <p className="font-semibold text-xs">Lector</p>
                          <p className="text-[10px] text-veyra-muted">Solo lectura</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={handleCreateInvitation}
                    loading={creating}
                    className="w-full"
                    size="sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Generar enlace de invitación</span>
                  </Button>
                </div>

                {/* Active invitations */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-veyra-muted">
                      Invitaciones activas ({invitations.length})
                    </h4>
                    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />}
                  </div>

                  {invitations.length === 0 ? (
                    <div className="p-4 rounded-lg border border-dashed border-veyra-border text-center text-veyra-muted">
                      No hay enlaces activos. Genera uno para compartir este recurso desde la web o el móvil.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {invitations.map((inv) => {
                        const joinUrl = buildJoinUrl(inv.invite_code);
                        return (
                          <div
                            key={inv.id}
                            className="p-3 rounded-lg bg-veyra-card border border-veyra-border space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="px-2 py-0.5 rounded bg-veyra-elevated font-mono text-[11px] font-semibold text-accent">
                                  {inv.invite_code}
                                </span>
                                <span
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                    inv.role === 'editor'
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : 'bg-blue-500/15 text-blue-400'
                                  )}
                                >
                                  {inv.role === 'editor' ? 'Editor' : 'Lector'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRevokeInvitation(inv.id)}
                                title="Revocar invitación"
                                className="p-1.5 rounded text-veyra-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                readOnly
                                value={joinUrl}
                                className="flex-1 px-2.5 py-1 rounded bg-veyra-elevated border border-veyra-border text-[11px] text-veyra-muted font-mono truncate"
                              />
                              <button
                                type="button"
                                onClick={() => handleCopy(joinUrl, `url-${inv.id}`, 'Enlace')}
                                className="px-2.5 py-1 rounded bg-accent/15 hover:bg-accent/25 text-accent font-medium flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                {copiedId === `url-${inv.id}` ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>Enlace</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(inv.invite_code, `code-${inv.id}`, 'Código')}
                                className="px-2.5 py-1 rounded bg-veyra-elevated hover:bg-veyra-border text-veyra-text font-medium flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                {copiedId === `code-${inv.id}` ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Share2 className="w-3 h-3" />
                                )}
                                <span>Código</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-veyra-card border border-veyra-border space-y-3">
                <div className="flex items-center gap-2 text-veyra-text font-medium">
                  <Shield className="w-4 h-4 text-accent" />
                  <span>Estás colaborando en este recurso</span>
                </div>
                <p className="text-veyra-muted">
                  Solo el propietario puede generar o revocar enlaces de invitación.
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={handleLeave}>
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                  <span>Abandonar recurso compartido</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Members */}
        {activeTab === 'members' && (
          <div className="space-y-2.5">
            {/* Owner row */}
            <div className="p-3 rounded-lg bg-veyra-card border border-veyra-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Crown className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="font-semibold text-veyra-text">
                    {isOwner ? 'Tú (Propietario)' : 'Propietario'}
                  </p>
                  <p className="text-[10px] text-veyra-muted">Control total del recurso</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-semibold">
                Propietario
              </span>
            </div>

            {collaborators.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-veyra-border text-center text-veyra-muted">
                Aún no hay otros miembros en este recurso.
              </div>
            ) : (
              collaborators.map((m) => {
                const isSelf = effectiveUserId && m.member_id === effectiveUserId;
                const isBusy = updatingMemberId === m.collaboration_id;
                return (
                  <div
                    key={m.collaboration_id}
                    className="p-3 rounded-lg bg-veyra-card border border-veyra-border flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-veyra-text truncate">
                        {m.name} {isSelf ? '(Tú)' : ''}
                      </p>
                      {m.email && (
                        <p className="text-[10px] text-veyra-muted truncate">{m.email}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isOwner ? (
                        <>
                          <select
                            value={m.role}
                            disabled={isBusy}
                            onChange={(e) => handleRoleChange(m, e.target.value as CollabRole)}
                            className="px-2 py-1 rounded bg-veyra-elevated border border-veyra-border text-xs text-veyra-text cursor-pointer"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Lector</option>
                          </select>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRemoveMember(m)}
                            title="Quitar miembro"
                            className="p-1.5 rounded text-veyra-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-veyra-elevated text-[10px] font-medium text-veyra-muted">
                          {m.role === 'editor' ? 'Editor' : 'Lector'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {!isOwner && (
              <div className="pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleLeave}>
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                  <span>Abandonar este recurso</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Activity */}
        {activeTab === 'activity' && (
          <div className="space-y-2">
            {activities.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-veyra-border text-center text-veyra-muted">
                No hay actividad registrada todavía.
              </div>
            ) : (
              activities.map((act) => (
                <div
                  key={act.id}
                  className="p-2.5 rounded-lg bg-veyra-card border border-veyra-border flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-veyra-text">
                      <span className="font-semibold">{act.actor_name || 'Colaborador'}</span>{' '}
                      <span className="text-veyra-muted">
                        {ACTION_LABEL[act.action] || act.action}
                      </span>
                      {act.item_title ? ` "${act.item_title}"` : ''}
                    </p>
                    {act.details && (
                      <p className="text-[10.5px] text-veyra-muted mt-0.5 truncate">{act.details}</p>
                    )}
                  </div>
                  {act.created_at && (
                    <span className="text-[10px] text-veyra-subtle shrink-0">
                      {new Date(act.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
