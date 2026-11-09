import React, { useState, useRef, useEffect } from 'react';
import {
  LogOut,
  Check,
  PanelLeft,
} from 'lucide-react';
import { MorphIcon } from 'morphicons/react';
import { Sun, Moon } from 'lucide';
import { useRealtimeConnection } from '../../hooks/useRealtimeConnection';
import { useTheme } from '../../theme/ThemeProvider';
import { ACCENT_PALETTES, type AccentTheme } from '../../theme/accentColors';
import type { User } from '@supabase/supabase-js';
import type { Database } from '../../types/database';
import { cn } from '../../lib/utils';

export type ActiveModule = 'reminders' | 'notes';

type Profile = Database['public']['Tables']['profiles']['Row'];

export interface TopBarProps {
  user: User | null;
  profile: Profile | null;
  activeModule: ActiveModule;
  onChangeModule: (module: ActiveModule) => void;
  pendingRemindersCount?: number;
  notesCount?: number;
  onSignOut: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  user,
  profile,
  activeModule,
  onChangeModule,
  pendingRemindersCount = 0,
  onSignOut,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const { isConnected, latency } = useRealtimeConnection();
  const { setMode, accentTheme, setAccentTheme, isDark } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const userInitial = (user?.email?.[0] || 'V').toUpperCase();
  const displayName = profile?.user_profile || user?.email?.split('@')[0] || 'Usuario';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableAccents: { theme: AccentTheme; label: string; hex: string }[] = [
    { theme: 'blue', label: 'Azul', hex: ACCENT_PALETTES.blue[isDark ? 'dark' : 'light'].primary },
    { theme: 'purple', label: 'Púrpura', hex: ACCENT_PALETTES.purple[isDark ? 'dark' : 'light'].primary },
    { theme: 'green', label: 'Verde', hex: ACCENT_PALETTES.green[isDark ? 'dark' : 'light'].primary },
    { theme: 'red', label: 'Rojo', hex: ACCENT_PALETTES.red[isDark ? 'dark' : 'light'].primary },
    { theme: 'amber', label: 'Ámbar', hex: ACCENT_PALETTES.amber[isDark ? 'dark' : 'light'].primary },
    { theme: 'pink', label: 'Rosa', hex: ACCENT_PALETTES.pink[isDark ? 'dark' : 'light'].primary },
  ];

  return (
    <header className="h-14 border-b border-veyra-border bg-veyra-card px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 shrink-0 select-none">
      {/* Left: Sidebar Toggle (when collapsed) + Logo */}
      <div className="flex items-center gap-2">
        {!isSidebarOpen && activeModule === 'notes' && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title="Mostrar barra lateral (Ctrl+\)"
            className="p-1.5 rounded-md text-veyra-muted hover:text-accent hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center mr-1"
          >
            <PanelLeft className="w-4 h-4 text-accent" />
          </button>
        )}

        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <svg className="w-6 h-6" viewBox="0 0 100 100" fill="none">
            <path
              d="M28 32 L50 72 L72 32"
              stroke="var(--accent-primary, #60A5FA)"
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="50" cy="40" r="6" fill="#fcfcfc" />
          </svg>
        </div>
      </div>

      {/* Center: Module Navigation Tabs (Minimal text with subtle accent underline) */}
      <nav className="flex items-center gap-6 h-full">
        <button
          onClick={() => onChangeModule('notes')}
          className={cn(
            'relative h-full flex items-center text-sm font-medium transition-colors',
            activeModule === 'notes'
              ? 'text-veyra-text font-semibold'
              : 'text-veyra-muted hover:text-veyra-text'
          )}
        >
          <span>Notas & Docs</span>
          {activeModule === 'notes' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
          )}
        </button>

        <button
          onClick={() => onChangeModule('reminders')}
          className={cn(
            'relative h-full flex items-center gap-1.5 text-sm font-medium transition-colors',
            activeModule === 'reminders'
              ? 'text-veyra-text font-semibold'
              : 'text-veyra-muted hover:text-veyra-text'
          )}
        >
          <span>Recordatorios</span>
          {pendingRemindersCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          )}
          {activeModule === 'reminders' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
          )}
        </button>
      </nav>

      {/* Right: Live Status Dot & User Menu */}
      <div className="flex items-center gap-3">
        {/* Connection status indicator (6px dot with tooltip) */}
        <div
          className="flex items-center justify-center p-1.5"
          title={
            isConnected
              ? `Conectado (${latency ? `${latency}ms` : 'En vivo'})`
              : 'Desconectado / Reconectando...'
          }
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full transition-colors',
              isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            )}
          />
        </div>

        {/* User Avatar & Dropdown Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            title={displayName}
            className="w-7 h-7 rounded-full bg-veyra-elevated border border-veyra-border text-veyra-text font-semibold text-xs flex items-center justify-center hover:border-veyra-muted/40 transition-colors cursor-pointer"
          >
            {userInitial}
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 p-1.5 rounded-md bg-veyra-card border border-veyra-border shadow-elevated z-50 animate-in fade-in zoom-in-95 duration-100">
              {/* User Email Info */}
              <div className="px-2.5 py-2 border-b border-veyra-border mb-1">
                <p className="text-xs font-medium text-veyra-text truncate">{displayName}</p>
                <p className="text-[11px] text-veyra-muted truncate mt-0.5">{user?.email}</p>
              </div>

              {/* Theme Mode Toggle with MorphIcon */}
              <button
                onClick={() => setMode(isDark ? 'light' : 'dark')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated rounded-md transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <MorphIcon icon={isDark ? Moon : Sun} size={15} color="var(--accent-primary)" />
                  <span>Modo {isDark ? 'Oscuro' : 'Claro'}</span>
                </span>
                <span className="text-[10px] text-veyra-subtle">Cambiar</span>
              </button>

              {/* Accent Color Palette Selector */}
              <div className="px-2.5 py-2">
                <div className="text-[10px] font-semibold text-veyra-subtle uppercase tracking-wider mb-2">
                  Color de Acento
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {availableAccents.map((item) => (
                    <button
                      key={item.theme}
                      onClick={() => setAccentTheme(item.theme)}
                      title={item.label}
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer',
                        accentTheme === item.theme && 'ring-2 ring-offset-1 ring-offset-veyra-card ring-accent'
                      )}
                      style={{ backgroundColor: item.hex }}
                    >
                      {accentTheme === item.theme && (
                        <Check className="w-3 h-3 text-white stroke-[3]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-veyra-border my-1" />

              {/* Sign Out */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onSignOut();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-veyra-muted hover:text-red-400 hover:bg-veyra-elevated rounded-md transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
