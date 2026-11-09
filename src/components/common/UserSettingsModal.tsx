import React from 'react';
import { LogOut, Check, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { ACCENT_PALETTES, type AccentTheme } from '../../theme/accentColors';
import { cn } from '../../lib/utils';
import { Modal } from './Modal';

export interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userName?: string;
  onSignOut?: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  userName,
  onSignOut,
}) => {
  const { setMode, accentTheme, setAccentTheme, isDark } = useTheme();

  const availableAccents: { theme: AccentTheme; label: string; hex: string }[] = [
    { theme: 'blue', label: 'Azul', hex: ACCENT_PALETTES.blue[isDark ? 'dark' : 'light'].primary },
    { theme: 'purple', label: 'Púrpura', hex: ACCENT_PALETTES.purple[isDark ? 'dark' : 'light'].primary },
    { theme: 'green', label: 'Verde', hex: ACCENT_PALETTES.green[isDark ? 'dark' : 'light'].primary },
    { theme: 'red', label: 'Rojo', hex: ACCENT_PALETTES.red[isDark ? 'dark' : 'light'].primary },
    { theme: 'amber', label: 'Ámbar', hex: ACCENT_PALETTES.amber[isDark ? 'dark' : 'light'].primary },
    { theme: 'pink', label: 'Rosa', hex: ACCENT_PALETTES.pink[isDark ? 'dark' : 'light'].primary },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Preferencias y Cuenta" maxWidth="sm">
      <div className="space-y-4 text-xs">
        {/* User Info */}
        <div className="p-3 rounded-lg bg-veyra-elevated/60 border border-veyra-border">
          <p className="font-semibold text-sm text-veyra-text">{userName || 'Usuario'}</p>
          <p className="text-veyra-muted mt-0.5">{userEmail}</p>
        </div>

        {/* Theme mode toggle */}
        <div>
          <label className="block text-[11px] font-medium text-veyra-muted mb-1.5 uppercase tracking-wider">
            Tema de Interfaz
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('dark')}
              className={cn(
                'flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer',
                isDark
                  ? 'bg-accent/15 border-accent text-accent font-semibold'
                  : 'bg-veyra-elevated border-veyra-border text-veyra-muted hover:text-veyra-text'
              )}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Modo Oscuro</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('light')}
              className={cn(
                'flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer',
                !isDark
                  ? 'bg-accent/15 border-accent text-accent font-semibold'
                  : 'bg-veyra-elevated border-veyra-border text-veyra-muted hover:text-veyra-text'
              )}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Modo Claro</span>
            </button>
          </div>
        </div>

        {/* Accent color picker */}
        <div>
          <label className="block text-[11px] font-medium text-veyra-muted mb-2 uppercase tracking-wider">
            Color de Acento
          </label>
          <div className="grid grid-cols-6 gap-2">
            {availableAccents.map((item) => (
              <button
                key={item.theme}
                type="button"
                onClick={() => setAccentTheme(item.theme)}
                title={item.label}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer mx-auto',
                  accentTheme === item.theme && 'ring-2 ring-offset-2 ring-offset-veyra-card ring-accent'
                )}
                style={{ backgroundColor: item.hex }}
              >
                {accentTheme === item.theme && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
              </button>
            ))}
          </div>
        </div>

        {/* Sign Out Button */}
        {onSignOut && (
          <div className="pt-3 border-t border-veyra-border">
            <button
              type="button"
              onClick={() => {
                onClose();
                onSignOut();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 font-medium transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
