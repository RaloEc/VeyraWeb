import React from 'react';
import {
  Bell,
  Search,
  Plus,
  Notebook,
  ChevronLeft,
  ChevronRight,
  Users,
  BarChart2,
  Settings,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { CreateWithVeyraAssistant } from '../../components/common/CreateWithVeyraAssistant';
import { cn } from '../../lib/utils';

export type MobileTab = 'agenda' | 'notes';
export type MobileBottomMorph = 'none' | 'create' | 'profile';

export interface MobileBottomTabBarProps {
  activeTab: MobileTab;
  userInitial: string;
  userName?: string;
  userEmail?: string;
  activeMorph: MobileBottomMorph;
  onChangeMorph: (morph: MobileBottomMorph) => void;
  onChangeTab: (tab: MobileTab) => void;
  onOpenSearch: () => void;
  onOpenSettingsPage: () => void;
  onOpenStats: () => void;
  onJoinWithCode: () => void;
  onSignOut: () => void;
  onSyncNow?: () => void;
  onCreateReminder: () => void;
  onCreateEvent: () => void;
  onCreateNote: () => void;
  onSaveReminder: (payload: {
    title: string;
    due_date_ms: number;
    priority?: 1 | 3;
    control_level?: 'normal' | 'critical';
    description?: string;
  }) => Promise<unknown>;
  onSaveEvent: (payload: {
    title: string;
    start_time_ms: number;
    end_time_ms: number;
    is_all_day?: boolean;
    all_day_date?: string | null;
    location?: string;
    description?: string;
    tags?: string[] | null;
  }) => Promise<unknown>;
  onSaveNote: (title: string, contentHtml?: string) => Promise<unknown>;
}

export const MobileBottomTabBar: React.FC<MobileBottomTabBarProps> = ({
  activeTab,
  userInitial,
  userName,
  userEmail,
  activeMorph,
  onChangeMorph,
  onChangeTab,
  onOpenSearch,
  onOpenSettingsPage,
  onOpenStats,
  onJoinWithCode,
  onSignOut,
  onSyncNow,
  onCreateReminder,
  onCreateEvent,
  onCreateNote,
  onSaveReminder,
  onSaveEvent,
  onSaveNote,
}) => {
  const isMorphed = activeMorph !== 'none';
  const displayName = userName || userEmail?.split('@')[0] || 'Usuario';

  return (
    <>
      {/* Backdrop when morphed */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 transition-opacity duration-250',
          isMorphed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => onChangeMorph('none')}
        aria-hidden="true"
      />

      {/* Morphing Bottom Capsule */}
      <div className="fixed bottom-3 left-3 right-3 z-50 flex flex-col items-center pointer-events-none pb-[env(safe-area-inset-bottom,0px)]">
        <div
          className={cn(
            'w-full bg-veyra-card/95 backdrop-blur-xl border border-veyra-border shadow-[0_12px_36px_rgba(0,0,0,0.5)] pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] origin-bottom',
            isMorphed
              ? 'max-w-[440px] rounded-[28px] p-4'
              : 'max-w-[400px] h-[62px] px-2 rounded-[30px]'
          )}
        >
          {activeMorph === 'create' ? (
            <div className="animate-in fade-in zoom-in-95 duration-200">
              <CreateWithVeyraAssistant
                onClose={() => onChangeMorph('none')}
                onManualReminder={onCreateReminder}
                onManualEvent={onCreateEvent}
                onManualNote={onCreateNote}
                onSaveReminder={onSaveReminder}
                onSaveEvent={onSaveEvent}
                onSaveNote={onSaveNote}
                autoFocus={false}
              />
            </div>
          ) : activeMorph === 'profile' ? (
            <div className="space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
              {/* Header: < Atrás + Mi cuenta */}
              <div className="relative flex items-center justify-center min-h-8">
                <button
                  type="button"
                  onClick={() => onChangeMorph('none')}
                  className="absolute left-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-veyra-elevated border border-veyra-border text-xs font-medium text-veyra-text hover:bg-veyra-border/60 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Atrás</span>
                </button>
                <h3 className="text-sm font-semibold text-veyra-text">Mi cuenta</h3>
              </div>

              {/* Profile Card */}
              <button
                type="button"
                onClick={() => {
                  onChangeMorph('none');
                  onOpenSettingsPage();
                }}
                className="w-full p-3 rounded-2xl bg-veyra-elevated/60 border border-veyra-border flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-veyra-elevated transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-veyra-text truncate">{displayName}</p>
                    <p className="text-[11px] text-veyra-muted truncate flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="truncate">{userEmail || 'Sincronizado'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onSyncNow && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSyncNow();
                      }}
                      title="Sincronizar ahora"
                      className="w-7 h-7 rounded-full bg-veyra-card border border-veyra-border flex items-center justify-center text-veyra-muted hover:text-veyra-text"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                </div>
              </button>

              {/* Grouped Menu Card */}
              <div className="rounded-2xl bg-veyra-elevated/60 border border-veyra-border divide-y divide-veyra-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    onChangeMorph('none');
                    onJoinWithCode();
                  }}
                  className="w-full px-3.5 py-3 flex items-center justify-between hover:bg-veyra-elevated transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-veyra-text">Unirse con código</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onChangeMorph('none');
                    onOpenStats();
                  }}
                  className="w-full px-3.5 py-3 flex items-center justify-between hover:bg-veyra-elevated transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                      <BarChart2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-veyra-text">Estadísticas</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onChangeMorph('none');
                    onOpenSettingsPage();
                  }}
                  className="w-full px-3.5 py-3 flex items-center justify-between hover:bg-veyra-elevated transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-zinc-500/15 text-veyra-muted flex items-center justify-center">
                      <Settings className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-veyra-text">Ajustes</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                </button>
              </div>

              {/* Cerrar sesión */}
              <button
                type="button"
                onClick={() => {
                  onChangeMorph('none');
                  onSignOut();
                }}
                className="w-full py-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-rose-500/15 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          ) : (
            <nav className="w-full h-full grid grid-cols-5 items-center">
              {/* 1. Recordatorios */}
              <button
                type="button"
                onClick={() => onChangeTab('agenda')}
                className="flex flex-col items-center justify-center gap-0.5 py-1 cursor-pointer"
              >
                <div
                  className={cn(
                    'px-3 py-1 rounded-full transition-colors',
                    activeTab === 'agenda' ? 'bg-accent/15 text-accent' : 'text-veyra-muted'
                  )}
                >
                  <Bell className="w-[18px] h-[18px]" />
                </div>
                <span
                  className={cn(
                    'text-[10px] leading-none',
                    activeTab === 'agenda'
                      ? 'text-veyra-text font-semibold'
                      : 'text-veyra-muted font-medium'
                  )}
                >
                  Recordatorios
                </span>
              </button>

              {/* 2. Buscar */}
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex flex-col items-center justify-center gap-0.5 py-1 cursor-pointer text-veyra-muted hover:text-veyra-text"
              >
                <div className="px-3 py-1 rounded-full">
                  <Search className="w-[18px] h-[18px]" />
                </div>
                <span className="text-[10px] leading-none font-medium">Buscar</span>
              </button>

              {/* 3. Crear (Center Hero) */}
              <div className="flex flex-col items-center justify-center -mt-5">
                <button
                  type="button"
                  onClick={() => onChangeMorph('create')}
                  aria-label="Crear con Veyra"
                  className="w-[54px] h-[54px] rounded-full bg-accent text-white flex items-center justify-center ring-4 ring-veyra-card shadow-[0_8px_22px_-4px_color-mix(in_srgb,var(--accent-primary)_65%,transparent),inset_0_1px_0_rgba(255,255,255,0.28)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  <Plus className="w-6 h-6 stroke-[2.5]" />
                </button>
                <span className="text-[10.5px] leading-none font-semibold text-veyra-text mt-1">
                  Crear
                </span>
              </div>

              {/* 4. Notas */}
              <button
                type="button"
                onClick={() => onChangeTab('notes')}
                className="flex flex-col items-center justify-center gap-0.5 py-1 cursor-pointer"
              >
                <div
                  className={cn(
                    'px-3 py-1 rounded-full transition-colors',
                    activeTab === 'notes' ? 'bg-accent/15 text-accent' : 'text-veyra-muted'
                  )}
                >
                  <Notebook className="w-[18px] h-[18px]" />
                </div>
                <span
                  className={cn(
                    'text-[10px] leading-none',
                    activeTab === 'notes'
                      ? 'text-veyra-text font-semibold'
                      : 'text-veyra-muted font-medium'
                  )}
                >
                  Notas
                </span>
              </button>

              {/* 5. Perfil */}
              <button
                type="button"
                onClick={() => onChangeMorph('profile')}
                className="flex flex-col items-center justify-center gap-0.5 py-1 cursor-pointer"
              >
                <div className="relative">
                  <div className="w-7 h-7 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center">
                    {userInitial}
                  </div>
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-veyra-card" />
                </div>
                <span className="text-[10px] leading-none font-medium text-veyra-muted mt-0.5">
                  Perfil
                </span>
              </button>
            </nav>
          )}
        </div>
      </div>
    </>
  );
};
