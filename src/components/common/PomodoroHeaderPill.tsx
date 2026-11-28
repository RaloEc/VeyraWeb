import React, { useState, useRef, useEffect } from 'react';
import { Timer, Play, Pause, RotateCcw, ChevronDown, Flame } from 'lucide-react';
import { usePomodoro, type PomodoroMode } from '../../context/PomodoroContext';
import { cn } from '../../lib/utils';

const MODE_OPTIONS: Array<{ id: PomodoroMode; label: string; tip: string }> = [
  { id: 'work', label: 'Enfoque', tip: '25 min' },
  { id: 'shortBreak', label: 'Descanso corto', tip: '5 min' },
  { id: 'longBreak', label: 'Descanso largo', tip: '15 min' },
];

export const PomodoroHeaderPill: React.FC = () => {
  const {
    mode,
    isRunning,
    isActive,
    completedSessions,
    formattedTime,
    progressPercent,
    toggleRunning,
    switchMode,
    reset,
  } = usePomodoro();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const isWork = mode === 'work';

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* Compact Interactive Pill */}
      <div
        className={cn(
          'flex items-center rounded-full border transition-colors text-xs select-none',
          isActive
            ? isWork
              ? 'bg-accent/10 border-accent/30 text-veyra-text'
              : 'bg-emerald-500/10 border-emerald-500/30 text-veyra-text'
            : 'bg-veyra-elevated/60 border-veyra-border text-veyra-muted hover:text-veyra-text hover:border-veyra-muted/40'
        )}
      >
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title="Abrir controles de Pomodoro"
          className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-l-full cursor-pointer"
        >
          <Timer
            className={cn(
              'w-3.5 h-3.5 shrink-0',
              isActive
                ? isWork
                  ? 'text-accent'
                  : 'text-emerald-500'
                : 'text-veyra-muted',
              isRunning && 'animate-pulse'
            )}
          />
          <span className="font-mono font-semibold tabular-nums text-[12px] text-veyra-text">
            {formattedTime}
          </span>
          <ChevronDown
            className={cn(
              'w-3 h-3 text-veyra-subtle transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        <div className="w-px h-3.5 bg-veyra-border/80" />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleRunning();
          }}
          title={isRunning ? 'Pausar Pomodoro' : 'Iniciar Pomodoro'}
          className={cn(
            'p-1.5 pr-2 rounded-r-full transition-colors cursor-pointer flex items-center justify-center',
            isRunning
              ? 'text-accent hover:bg-accent/10'
              : 'text-veyra-muted hover:text-veyra-text hover:bg-veyra-hover'
          )}
        >
          {isRunning ? (
            <Pause className="w-3 h-3 fill-current" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
        </button>
      </div>

      {/* Popover with Full Controls */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 p-4 rounded-2xl bg-veyra-card border border-veyra-border shadow-elevated z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-veyra-muted" />
              <span className="text-xs font-semibold text-veyra-text">Temporizador Pomodoro</span>
            </div>
            <span
              title="Sesiones completadas hoy"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-veyra-elevated border border-veyra-border text-[11px] font-medium text-veyra-muted"
            >
              <Flame className="w-3 h-3 text-veyra-muted" />
              <span>{completedSessions}</span>
            </span>
          </div>

          {/* Mode Selector */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-veyra-elevated/70 border border-veyra-border mb-4">
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => switchMode(opt.id)}
                  title={opt.tip}
                  className={cn(
                    'py-1.5 px-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer truncate',
                    active
                      ? 'bg-veyra-card text-veyra-text shadow-xs border border-veyra-border font-semibold'
                      : 'text-veyra-muted hover:text-veyra-text'
                  )}
                >
                  {opt.id === 'work' ? 'Enfoque' : opt.id === 'shortBreak' ? 'Corto' : 'Largo'}
                </button>
              );
            })}
          </div>

          {/* Large Timer Display + Subtle Progress */}
          <div className="flex flex-col items-center mb-4">
            <div className="text-4xl font-mono font-bold tabular-nums tracking-tight text-veyra-text leading-none">
              {formattedTime}
            </div>
            <div className="w-full h-1 rounded-full bg-veyra-elevated mt-3 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isWork ? 'bg-accent' : 'bg-emerald-500'
                )}
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleRunning}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                isRunning
                  ? 'bg-veyra-elevated border border-veyra-border text-veyra-text hover:bg-veyra-hover'
                  : 'bg-accent text-white hover:brightness-110'
              )}
            >
              {isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pausar</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Iniciar</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={reset}
              title="Reiniciar temporizador"
              className="p-2 rounded-xl bg-veyra-elevated border border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-veyra-hover transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
