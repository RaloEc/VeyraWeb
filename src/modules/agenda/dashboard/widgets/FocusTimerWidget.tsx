import React, { useState, useEffect } from 'react';
import { Timer, Play, Pause, RotateCcw, Coffee, Flame } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { toast } from 'sonner';
import { WidgetCard } from '../WidgetCard';

type PomodoroMode = 'work' | 'shortBreak' | 'longBreak';

const MODE_DURATIONS: Record<PomodoroMode, number> = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const MODE_OPTIONS: Array<{ id: PomodoroMode; label: string; tip: string }> = [
  { id: 'work', label: 'Enfoque', tip: 'Sesión de 25 min' },
  { id: 'shortBreak', label: 'Corto', tip: 'Pausa de 5 min' },
  { id: 'longBreak', label: 'Largo', tip: 'Pausa de 15 min' },
];

interface FocusTimerWidgetProps {
  isCompactHeight?: boolean;
}

export const FocusTimerWidget: React.FC<FocusTimerWidgetProps> = ({
  isCompactHeight = false,
}) => {
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [timeLeft, setTimeLeft] = useState<number>(MODE_DURATIONS.work);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [completedSessions, setCompletedSessions] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const stored = localStorage.getItem('veyra_pomodoro_completed');
    return stored ? parseInt(stored, 10) || 0 : 0;
  });

  // Tick down every second without side effects inside state updater
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Handle timer completion cleanly in its own effect
  useEffect(() => {
    if (!isRunning || timeLeft > 0) return;

    setIsRunning(false);
    if (mode === 'work') {
      const nextCount = completedSessions + 1;
      setCompletedSessions(nextCount);
      if (typeof window !== 'undefined') {
        localStorage.setItem('veyra_pomodoro_completed', String(nextCount));
      }
      toast.success('¡Sesión de enfoque completada! Tómate un respiro.');
      const nextMode: PomodoroMode = nextCount % 4 === 0 ? 'longBreak' : 'shortBreak';
      setMode(nextMode);
      setTimeLeft(MODE_DURATIONS[nextMode]);
    } else {
      toast.info('¡Descanso terminado! Listo para enfocarte.');
      setMode('work');
      setTimeLeft(MODE_DURATIONS.work);
    }
  }, [isRunning, timeLeft, mode, completedSessions]);

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
  const isWork = mode === 'work';

  const modePills = (
    <div className="flex items-center gap-0.5 text-[11px] shrink-0">
      {MODE_OPTIONS.map((opt) => {
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleSwitchMode(opt.id)}
            className={cn(
              'px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer',
              active
                ? opt.id === 'work'
                  ? 'bg-rose-500/15 text-rose-400 font-semibold'
                  : 'bg-emerald-500/15 text-emerald-400 font-semibold'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/50'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const controls = (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() => setIsRunning((prev) => !prev)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
          isRunning
            ? 'bg-veyra-elevated text-veyra-text hover:bg-veyra-hover'
            : isWork
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
        className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/60 transition-colors cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  if (isCompactHeight) {
    return (
      <section className="flex flex-col h-full min-h-0 overflow-hidden justify-between gap-2.5">
        {/* Flat Compact Header */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Timer className="w-4 h-4 text-rose-400 shrink-0" />
            <h3 className="text-[13px] font-semibold text-veyra-text tracking-tight truncate">
              Pomodoro
            </h3>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-veyra-muted shrink-0">
              <Flame className="w-3 h-3 text-amber-400 shrink-0" />
              {completedSessions}
            </span>
          </div>

          {modePills}
        </div>

        {/* Horizontal timer + controls */}
        <div className="flex items-center justify-between gap-3 flex-1 min-h-0">
          <div className="text-3xl font-mono font-bold tabular-nums tracking-tight text-veyra-text select-none leading-none">
            {formattedTime}
          </div>
          {controls}
        </div>

        {/* Hairline integrated progress bar */}
        <div className="w-full h-1 bg-veyra-elevated rounded-full overflow-hidden shrink-0">
          <div
            className={cn(
              'h-full transition-all duration-300',
              isWork ? 'bg-rose-500' : 'bg-emerald-500'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </section>
    );
  }

  const currentTip = MODE_OPTIONS.find((o) => o.id === mode)?.tip || 'Sesión de enfoque';

  return (
    <WidgetCard
      title="Pomodoro"
      subtitle={`${completedSessions} ${completedSessions === 1 ? 'bloque' : 'bloques'}`}
      icon={<Timer className="w-4 h-4" />}
      iconClassName="text-rose-400"
      headerRight={modePills}
      footer={
        <div className="text-center text-[11px] text-veyra-muted flex items-center justify-center gap-1.5 truncate">
          <Coffee className="w-3 h-3 text-veyra-subtle shrink-0" />
          <span className="truncate">{currentTip}</span>
        </div>
      }
    >
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-2">
        <div className="text-3xl sm:text-4xl font-mono font-bold tabular-nums tracking-tight text-veyra-text mb-3 select-none">
          {formattedTime}
        </div>

        <div className="w-full max-w-[200px] h-1 bg-veyra-elevated rounded-full overflow-hidden mb-4 shrink-0">
          <div
            className={cn(
              'h-full transition-all duration-300',
              isWork ? 'bg-rose-500' : 'bg-emerald-500'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {controls}
      </div>
    </WidgetCard>
  );
};
