import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

export type PomodoroMode = 'work' | 'shortBreak' | 'longBreak';

export const POMODORO_DURATIONS: Record<PomodoroMode, number> = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

interface StoredPomodoroState {
  mode: PomodoroMode;
  isRunning: boolean;
  endTimeMs: number | null;
  remainingSeconds: number;
  completedSessions: number;
}

const STORAGE_KEY = 'veyra_pomodoro_state_v1';

function loadInitialState(): StoredPomodoroState {
  const legacyCompleted =
    typeof window !== 'undefined'
      ? parseInt(localStorage.getItem('veyra_pomodoro_completed') || '0', 10) || 0
      : 0;

  if (typeof window === 'undefined') {
    return {
      mode: 'work',
      isRunning: false,
      endTimeMs: null,
      remainingSeconds: POMODORO_DURATIONS.work,
      completedSessions: legacyCompleted,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        mode: 'work',
        isRunning: false,
        endTimeMs: null,
        remainingSeconds: POMODORO_DURATIONS.work,
        completedSessions: legacyCompleted,
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredPomodoroState>;
    const mode: PomodoroMode =
      parsed.mode === 'shortBreak' || parsed.mode === 'longBreak' ? parsed.mode : 'work';
    const completedSessions =
      typeof parsed.completedSessions === 'number' ? parsed.completedSessions : legacyCompleted;

    if (parsed.isRunning && typeof parsed.endTimeMs === 'number') {
      const remaining = Math.max(0, Math.ceil((parsed.endTimeMs - Date.now()) / 1000));
      return {
        mode,
        isRunning: remaining > 0,
        endTimeMs: remaining > 0 ? parsed.endTimeMs : null,
        remainingSeconds: remaining,
        completedSessions,
      };
    }

    const remainingSeconds =
      typeof parsed.remainingSeconds === 'number' && parsed.remainingSeconds >= 0
        ? parsed.remainingSeconds
        : POMODORO_DURATIONS[mode];

    return {
      mode,
      isRunning: false,
      endTimeMs: null,
      remainingSeconds,
      completedSessions,
    };
  } catch {
    return {
      mode: 'work',
      isRunning: false,
      endTimeMs: null,
      remainingSeconds: POMODORO_DURATIONS.work,
      completedSessions: legacyCompleted,
    };
  }
}

interface PomodoroContextValue {
  mode: PomodoroMode;
  timeLeft: number;
  isRunning: boolean;
  isActive: boolean;
  completedSessions: number;
  formattedTime: string;
  progressPercent: number;
  toggleRunning: () => void;
  switchMode: (newMode: PomodoroMode) => void;
  reset: () => void;
}

const PomodoroContext = createContext<PomodoroContextValue | null>(null);

export const PomodoroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<StoredPomodoroState>(loadInitialState);
  const [, setTick] = useState(0);

  // Persistir estado en localStorage ante cualquier cambio
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem('veyra_pomodoro_completed', String(state.completedSessions));
    } catch {
      // ignore storage quota errors
    }
  }, [state]);

  // Calcular tiempo restante real basado en endTimeMs (inmune a throttling de pestañas)
  const timeLeft = state.isRunning && state.endTimeMs
    ? Math.max(0, Math.ceil((state.endTimeMs - Date.now()) / 1000))
    : state.remainingSeconds;

  // Tick de refresco visual mientras corre + sincronización al volver a la pestaña
  useEffect(() => {
    if (!state.isRunning) return;
    const id = window.setInterval(() => {
      setTick((t) => (t + 1) % 1000000);
    }, 500);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTick((t) => (t + 1) % 1000000);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state.isRunning]);

  // Manejar finalización de sesión
  useEffect(() => {
    if (!state.isRunning || timeLeft > 0) return;

    if (state.mode === 'work') {
      const nextCount = state.completedSessions + 1;
      const nextMode: PomodoroMode = nextCount % 4 === 0 ? 'longBreak' : 'shortBreak';
      toast.success('¡Sesión de enfoque completada! Tómate un respiro.');
      setState({
        mode: nextMode,
        isRunning: false,
        endTimeMs: null,
        remainingSeconds: POMODORO_DURATIONS[nextMode],
        completedSessions: nextCount,
      });
    } else {
      toast.info('¡Descanso terminado! Listo para enfocarte.');
      setState((prev) => ({
        ...prev,
        mode: 'work',
        isRunning: false,
        endTimeMs: null,
        remainingSeconds: POMODORO_DURATIONS.work,
      }));
    }
  }, [state.isRunning, state.mode, state.completedSessions, timeLeft]);

  const toggleRunning = useCallback(() => {
    setState((prev) => {
      if (prev.isRunning && prev.endTimeMs) {
        const remaining = Math.max(0, Math.ceil((prev.endTimeMs - Date.now()) / 1000));
        return {
          ...prev,
          isRunning: false,
          endTimeMs: null,
          remainingSeconds: remaining,
        };
      }
      const baseSeconds =
        prev.remainingSeconds > 0 ? prev.remainingSeconds : POMODORO_DURATIONS[prev.mode];
      return {
        ...prev,
        isRunning: true,
        endTimeMs: Date.now() + baseSeconds * 1000,
        remainingSeconds: baseSeconds,
      };
    });
  }, []);

  const switchMode = useCallback((newMode: PomodoroMode) => {
    setState((prev) => ({
      ...prev,
      mode: newMode,
      isRunning: false,
      endTimeMs: null,
      remainingSeconds: POMODORO_DURATIONS[newMode],
    }));
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isRunning: false,
      endTimeMs: null,
      remainingSeconds: POMODORO_DURATIONS[prev.mode],
    }));
  }, []);

  const totalDuration = POMODORO_DURATIONS[state.mode];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progressPercent = Math.round(((totalDuration - timeLeft) / totalDuration) * 100);
  const isActive = state.isRunning || timeLeft < totalDuration;

  const value = useMemo<PomodoroContextValue>(
    () => ({
      mode: state.mode,
      timeLeft,
      isRunning: state.isRunning,
      isActive,
      completedSessions: state.completedSessions,
      formattedTime,
      progressPercent,
      toggleRunning,
      switchMode,
      reset,
    }),
    [
      state.mode,
      timeLeft,
      state.isRunning,
      isActive,
      state.completedSessions,
      formattedTime,
      progressPercent,
      toggleRunning,
      switchMode,
      reset,
    ]
  );

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
};

export const usePomodoro = (): PomodoroContextValue => {
  const ctx = useContext(PomodoroContext);
  if (!ctx) {
    throw new Error('usePomodoro must be used within a PomodoroProvider');
  }
  return ctx;
};
