import { useState, useEffect, useCallback } from 'react';
import { areColorsEqual } from '../constants/noteFonts';

const STORAGE_KEY_LAST_TEXT = 'veyra_editor_last_text_color';
const STORAGE_KEY_LAST_HIGHLIGHT = 'veyra_editor_last_highlight_color';
const STORAGE_KEY_RECENT_TEXT = 'veyra_editor_recent_text_colors';
const STORAGE_KEY_RECENT_HIGHLIGHT = 'veyra_editor_recent_highlight_colors';
const EVENT_NAME = 'veyra_editor_colors_sync';

export const DEFAULT_LAST_TEXT_COLOR = '#EF4444'; // Rojo clásico
export const DEFAULT_LAST_HIGHLIGHT_COLOR = 'rgba(250, 204, 21, 0.35)'; // Amarillo clásico de resaltador

function getStoredString(key: string, fallback: string): string {
  try {
    const val = localStorage.getItem(key);
    return val && typeof val === 'string' && val.trim() ? val : fallback;
  } catch {
    return fallback;
  }
}

function getStoredArray(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function useRecentEditorColors() {
  const [lastTextColor, setLastTextColorState] = useState<string>(() =>
    getStoredString(STORAGE_KEY_LAST_TEXT, DEFAULT_LAST_TEXT_COLOR)
  );
  const [lastHighlightColor, setLastHighlightColorState] = useState<string>(() =>
    getStoredString(STORAGE_KEY_LAST_HIGHLIGHT, DEFAULT_LAST_HIGHLIGHT_COLOR)
  );
  const [recentTextColors, setRecentTextColorsState] = useState<string[]>(() =>
    getStoredArray(STORAGE_KEY_RECENT_TEXT, [DEFAULT_LAST_TEXT_COLOR])
  );
  const [recentHighlightColors, setRecentHighlightColorsState] = useState<string[]>(() =>
    getStoredArray(STORAGE_KEY_RECENT_HIGHLIGHT, [DEFAULT_LAST_HIGHLIGHT_COLOR])
  );

  // Escuchar sincronización entre componentes o pestañas
  useEffect(() => {
    const sync = () => {
      setLastTextColorState(getStoredString(STORAGE_KEY_LAST_TEXT, DEFAULT_LAST_TEXT_COLOR));
      setLastHighlightColorState(getStoredString(STORAGE_KEY_LAST_HIGHLIGHT, DEFAULT_LAST_HIGHLIGHT_COLOR));
      setRecentTextColorsState(getStoredArray(STORAGE_KEY_RECENT_TEXT, [DEFAULT_LAST_TEXT_COLOR]));
      setRecentHighlightColorsState(getStoredArray(STORAGE_KEY_RECENT_HIGHLIGHT, [DEFAULT_LAST_HIGHLIGHT_COLOR]));
    };

    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const saveTextColor = useCallback((color: string) => {
    if (!color || color === 'default') return;
    try {
      localStorage.setItem(STORAGE_KEY_LAST_TEXT, color);
      const current = getStoredArray(STORAGE_KEY_RECENT_TEXT, []);
      const filtered = current.filter((c) => !areColorsEqual(c, color));
      const next = [color, ...filtered].slice(0, 5);
      localStorage.setItem(STORAGE_KEY_RECENT_TEXT, JSON.stringify(next));
      setLastTextColorState(color);
      setRecentTextColorsState(next);
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      // ignore
    }
  }, []);

  const saveHighlightColor = useCallback((color: string) => {
    if (!color || color === 'transparent') return;
    try {
      localStorage.setItem(STORAGE_KEY_LAST_HIGHLIGHT, color);
      const current = getStoredArray(STORAGE_KEY_RECENT_HIGHLIGHT, []);
      const filtered = current.filter((c) => !areColorsEqual(c, color));
      const next = [color, ...filtered].slice(0, 5);
      localStorage.setItem(STORAGE_KEY_RECENT_HIGHLIGHT, JSON.stringify(next));
      setLastHighlightColorState(color);
      setRecentHighlightColorsState(next);
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      // ignore
    }
  }, []);

  return {
    lastTextColor,
    lastHighlightColor,
    recentTextColors,
    recentHighlightColors,
    saveTextColor,
    saveHighlightColor,
  };
}

