import React, { useState, useEffect, useRef } from 'react';
import { Timer, Play, Pause, RotateCcw, Coffee, Flame } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { toast } from 'sonner';

type PomodoroMode = 'work' | 'shortBreak' | 'longBreak';

const MODE_DURATIONS: Record<PomodoroMode, number> = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

export const FocusTimerWidget: React.FC = () => {
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [timeLeft, setTimeLeft] = useState<number>(MODE_DURATIONS.work);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [completedSessions, setCompletedSessions] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const stored = localStorage.getItem('veyra_pomodoro_completed');
    return stored ? parseInt(stored, 10) || 0 : 0;
  });

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, mode]);

  const handleTimerComplete = () => {
    setIsRunning(false);
    if (mode === 'work') {
      const nextCount = completedSessions + 1;
      setCompletedSessions(nextCount);
      if (typeof window !== 'undefined') {
        localStorage.setItem('veyra_pomodoro_completed', String(nextCount));
      }
      toast.success('¡Sesión de enfoque completada! Tómate un respiro.');
      const nextMode = nextCount % 4 === 0 ? 'longBreak' : 'shortBreak';
      setMode(nextMode);
      setTimeLeft(MODE_DURATIONS[nextMode]);
    } else {
      toast.info('¡Descanso terminado! Listo para enfocarte.');
      setMode('work');
      setTimeLeft(MODE_DURATIONS.work);
    }
  };

  const handleSwitchMode = (newMode: PomodoroMode) => {
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(MODE_DURATIONS[newMode]);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(MODE_DURATIONS[mode]);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const totalDuration = MODE_DURATIONS[mode];
  const progressPercent = Math.round(((totalDuration - timeLeft) / totalDuration) * 100);

  return (
    <div className="flex flex-col h-full rounded-xl bg-veyra-card border border-veyra-border p-3.5 sm:p-4 shadow-xs min-h-0 overflow-hidden justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-veyra-border/60 mb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
            <Timer className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-veyra-text tracking-tight truncate">
              Pomodoro
            </h3>
            <p className="text-[10px] text-veyra-muted flex items-center gap-0.5 truncate">
              <Flame className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span>{completedSessions} {completedSessions === 1 ? 'bloque' : 'bloques'}</span>
            </p>
          </div>
        </div>

        {/* Mode selector pills */}
        <div className="flex items-center p-0.5 rounded-lg bg-veyra-elevated border border-veyra-border text-[10px] shrink-0 ml-1">
          <button
            type="button"
            onClick={() => handleSwitchMode('work')}
            className={cn(
              'px-1.5 py-0.5 rounded-md font-medium transition-colors cursor-pointer',
              mode === 'work'
                ? 'bg-rose-500/20 text-rose-400 font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            Enfoque
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('shortBreak')}
            className={cn(
              'px-1.5 py-0.5 rounded-md font-medium transition-colors cursor-pointer',
              mode === 'shortBreak'
                ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            Descanso
          </button>
        </div>
      </div>

      {/* Timer body */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-1">
        {/* Digital display */}
        <div className="text-2xl sm:text-3xl md:text-4xl font-mono font-bold tracking-tight text-veyra-text mb-1.5 select-none">
          {formattedTime}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-[180px] h-1.5 bg-veyra-elevated rounded-full overflow-hidden mb-2.5 border border-veyra-border/50 shrink-0">
          <div
            className={cn(
              'h-full transition-all duration-300',
              mode === 'work' ? 'bg-rose-500' : 'bg-emerald-500'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer',
              isRunning
                ? 'bg-veyra-elevated border border-veyra-border text-veyra-text hover:bg-white/5'
                : mode === 'work'
                ? 'bg-rose-500 text-white hover:opacity-90'
                : 'bg-emerald-500 text-white hover:opacity-90'
            )}
          >
            {isRunning ? (
              <>
                <Pause className="w-3 h-3 fill-current" />
                <span>Pausar</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Iniciar</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleReset}
            title="Reiniciar temporizador"
            className="p-1 rounded-lg bg-veyra-elevated border border-veyra-border text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Bottom tip */}
      <div className="text-center text-[10px] text-veyra-muted border-t border-veyra-border/60 pt-1.5 shrink-0 flex items-center justify-center gap-1 truncate">
        <Coffee className="w-2.5 h-2.5 text-veyra-subtle shrink-0" />
        <span className="truncate">
          {mode === 'work' ? 'Sesión de 25 minutos' : 'Relájate antes del bloque'}
        </span>
      </div>
    </div>
  );
};
