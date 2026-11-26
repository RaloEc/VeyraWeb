import React, { useMemo } from 'react';
import { History, Share2 } from 'lucide-react';

export interface MobileTopBarProps {
  userName?: string;
  userEmail?: string;
  onOpenCalendarHistory: () => void;
  onOpenShareOrSettings: () => void;
  onGoHome: () => void;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  userName,
  userEmail,
  onOpenCalendarHistory,
  onOpenShareOrSettings,
  onGoHome,
}) => {
  const cleanFirstName = useMemo(() => {
    const raw = userName || userEmail?.split('@')[0];
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed ? trimmed.split(' ')[0] : null;
  }, [userName, userEmail]);

  const greetingTitle = cleanFirstName ? `Hola, ${cleanFirstName}.` : 'Hola.';

  const contextualMessage = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Que tengas un día productivo';
    if (hour >= 12 && hour < 19) return 'Sigue con el buen ritmo';
    return 'Hora de descansar y desconectar';
  }, []);

  return (
    <header className="px-4 pt-3 pb-2 flex items-center justify-between gap-3 bg-veyra-canvas shrink-0 select-none">
      <button
        type="button"
        onClick={onGoHome}
        className="text-left min-w-0 flex-1 cursor-pointer"
      >
        <h1 className="text-[17px] font-bold tracking-tight text-veyra-text truncate">
          {greetingTitle}
        </h1>
        <p className="text-[11.5px] text-veyra-muted truncate mt-0.5">{contextualMessage}</p>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenCalendarHistory}
          title="Calendario e historial"
          className="w-9 h-9 rounded-full bg-veyra-elevated/80 border border-veyra-border flex items-center justify-center text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
        >
          <History className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenShareOrSettings}
          title="Compartir y opciones"
          className="w-9 h-9 rounded-full bg-veyra-elevated/80 border border-veyra-border flex items-center justify-center text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
