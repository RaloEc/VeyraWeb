import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Bell,
  Folder,
  Calendar,
  Layers,
  Share2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ClipboardPaste,
  Shield,
  Eye,
  Edit3,
  User as UserIcon,
  Home,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase } from '../../lib/supabase';
import { navigateTo } from '../../lib/navigation';
import { Button } from '../../components/common/Button';
import { LoginCard } from '../auth/LoginCard';
import type { Database } from '../../types/database';
import type { User } from '@supabase/supabase-js';

type ShareInvitation = Database['public']['Tables']['share_invitations']['Row'];

export interface JoinPageProps {
  currentUser?: User | null;
}

export const JoinPage: React.FC<JoinPageProps> = ({ currentUser: initialUser }) => {
  const [code, setCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('code') || '';
  });
  const [inputCode, setInputCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [invitation, setInvitation] = useState<ShareInvitation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser || null);

  // Keep track of auth state
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // Fetch invitation details
  const fetchInvitation = useCallback(async (targetCode: string) => {
    const cleanCode = targetCode.trim().toLowerCase();
    if (!cleanCode) {
      setInvitation(null);
      setErrorMsg(null);
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setAcceptError(null);

      const { data, error } = await supabase
        .from('share_invitations')
        .select('*')
        .ilike('invite_code', cleanCode)
        .eq('status', 'pending')
        .maybeSingle();

      if (error || !data) {
        setErrorMsg('Invitación no válida o expirada');
        setInvitation(null);
      } else {
        // Validate expiration if present
        if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
          setErrorMsg('Invitación no válida o expirada');
          setInvitation(null);
        } else {
          setInvitation(data);
          setErrorMsg(null);
        }
      }
    } catch (err: unknown) {
      console.error('[JoinPage] Error al consultar invitación:', err);
      setErrorMsg('Invitación no válida o expirada');
      setInvitation(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync with code query parameter changes
  useEffect(() => {
    if (code) {
      fetchInvitation(code);
    }
  }, [code, fetchInvitation]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputCode.trim();
    if (!clean) return;
    setCode(clean);
    navigateTo(`/join?code=${encodeURIComponent(clean)}`);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        // Handle if user pasted a full URL or just the code
        let extracted = text.trim();
        if (extracted.includes('code=')) {
          const match = extracted.match(/[?&]code=([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            extracted = match[1];
          }
        }
        setInputCode(extracted);
        setCode(extracted);
        navigateTo(`/join?code=${encodeURIComponent(extracted)}`);
      }
    } catch (err) {
      console.warn('[JoinPage] Clipboard read failed:', err);
    }
  };

  const handleAccept = async () => {
    if (!invitation && !code) return;
    const cleanCode = (invitation?.invite_code || code).trim().toLowerCase();

    // 1. Verificar si hay sesión activa
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    try {
      setIsAccepting(true);
      setAcceptError(null);

      // 2. Invocar la RPC oficial de Veyra en Supabase
      const { data, error } = await supabase.rpc('accept_share_invitation', {
        p_invite_code: cleanCode,
      });

      if (error) {
        setAcceptError(error.message || 'Error al unirse a la invitación');
        setIsAccepting(false);
        return;
      }

      // Celebración visual
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore
      }

      // 3. Redirección según tipo de recurso
      setTimeout(() => {
        const targetType = invitation?.target_type || (data as Record<string, string>)?.target_type;
        const targetId = invitation?.target_id || (data as Record<string, string>)?.target_id;

        if (targetType === 'note') {
          navigateTo(`/notes/${targetId}`);
        } else if (targetType === 'reminder') {
          navigateTo('/reminders');
        } else if (targetType === 'folder') {
          navigateTo(`/notes?folder=${targetId}`);
        } else {
          navigateTo('/');
        }
      }, 600);
    } catch (err: unknown) {
      console.error('[JoinPage] Error al aceptar:', err);
      setAcceptError('Error inesperado al aceptar la invitación: ' + (err as Error).message);
      setIsAccepting(false);
    }
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    // Proceed to accept automatically after logging in
    handleAccept();
  };

  // Render resource icon
  const renderResourceIcon = (targetType?: string) => {
    switch (targetType) {
      case 'note':
        return <FileText className="w-8 h-8 text-cyan-400" />;
      case 'reminder':
        return <Bell className="w-8 h-8 text-amber-400" />;
      case 'folder':
        return <Folder className="w-8 h-8 text-blue-400" />;
      case 'event':
        return <Calendar className="w-8 h-8 text-emerald-400" />;
      case 'batch':
        return <Layers className="w-8 h-8 text-purple-400" />;
      default:
        return <Share2 className="w-8 h-8 text-accent" />;
    }
  };

  const getResourceTypeName = (targetType?: string) => {
    switch (targetType) {
      case 'note':
        return 'Nota colaborativa';
      case 'reminder':
        return 'Recordatorio compartido';
      case 'folder':
        return 'Carpeta de notas';
      case 'event':
        return 'Evento';
      case 'batch':
        return 'Colección de elementos';
      default:
        return 'Recurso compartido';
    }
  };

  return (
    <div className="min-h-screen bg-veyra-canvas text-veyra-text flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Subtle ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-accent/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Bar with brand logo */}
      <header className="relative z-10 max-w-4xl mx-auto w-full flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="flex items-center gap-2.5 group cursor-pointer"
        >
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center font-bold text-white shadow-sm">
            V
          </div>
          <span className="font-bold text-sm tracking-wider text-veyra-text group-hover:text-accent transition-colors">
            VEYRA <span className="text-[10px] text-veyra-muted font-normal ml-1">WEB</span>
          </span>
        </button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateTo('/')}
          className="text-xs text-veyra-muted hover:text-veyra-text flex items-center gap-1.5"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Ir a la aplicación</span>
        </Button>
      </header>

      {/* Main Content Card */}
      <main className="relative z-10 w-full flex items-center justify-center my-auto py-8">
        {/* Modal / Overlay for Authentication if required */}
        {showAuthModal ? (
          <div className="w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-4 text-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-accent/15 text-accent border border-accent/20 mb-2">
                <Shield className="w-3.5 h-3.5" />
                Acceso requerido
              </span>
              <p className="text-xs text-veyra-muted">
                Inicia sesión o crea una cuenta para unirte al recurso colaborativo
              </p>
            </div>
            <LoginCard onSuccess={handleAuthSuccess} />
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="mt-4 text-xs text-veyra-subtle hover:text-veyra-text transition-colors cursor-pointer"
            >
              Cancelar y volver a la invitación
            </button>
          </div>
        ) : loading ? (
          /* Estado de Carga Animado */
          <div className="w-full max-w-md bg-veyra-card border border-veyra-border rounded-xl p-10 shadow-elevated flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-veyra-canvas border border-veyra-border flex items-center justify-center mb-4 relative">
              <Loader2 className="w-7 h-7 text-accent animate-spin" />
            </div>
            <h3 className="text-base font-semibold text-veyra-text">Verificando invitación...</h3>
            <p className="text-xs text-veyra-muted mt-1.5">
              Consultando detalles y permisos en Veyra Cloud
            </p>
          </div>
        ) : errorMsg ? (
          /* Estado de Error: Invitación no válida o expirada */
          <div className="w-full max-w-md bg-veyra-card border border-veyra-border rounded-xl p-8 shadow-elevated flex flex-col items-center text-center animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-veyra-text tracking-tight">{errorMsg}</h2>
            <p className="text-xs text-veyra-muted mt-2 max-w-xs leading-relaxed">
              El enlace de colaboración no existe, fue revocado o superó su tiempo de vigencia.
              Solicita un nuevo enlace al propietario.
            </p>

            <div className="w-full mt-6 flex flex-col gap-2.5">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setCode('');
                  setInputCode('');
                  setErrorMsg(null);
                  navigateTo('/join');
                }}
                className="w-full"
              >
                Probar con otro código
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateTo('/')}
                className="w-full text-xs"
              >
                Volver a Veyra
              </Button>
            </div>
          </div>
        ) : invitation ? (
          /* Estado de Invitación Válida */
          <div className="w-full max-w-md bg-veyra-card border border-veyra-border rounded-xl p-8 shadow-elevated flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            {/* Top Resource Badge */}
            <div className="w-14 h-14 rounded-2xl bg-veyra-canvas border border-veyra-border flex items-center justify-center mb-4 shadow-sm">
              {renderResourceIcon(invitation.target_type)}
            </div>

            <span className="text-[11px] font-semibold tracking-wider uppercase text-accent mb-1.5">
              {getResourceTypeName(invitation.target_type)}
            </span>

            {/* Target Resource Name */}
            <h2 className="text-2xl font-bold tracking-tight text-veyra-text mb-3 px-2 line-clamp-2">
              {invitation.target_name || 'Elemento compartido'}
            </h2>

            {/* Role & Access Info */}
            <div className="flex items-center gap-2 my-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-veyra-border text-veyra-text">
                {invitation.role === 'editor' ? (
                  <>
                    <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Rol: <strong>Editor</strong> (Lectura y edición)</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    <span>Rol: <strong>Lector</strong> (Solo lectura)</span>
                  </>
                )}
              </div>
            </div>

            {/* Current user session pill or auth note */}
            <div className="w-full mt-4 p-3 rounded-lg bg-veyra-canvas/60 border border-veyra-border/60 text-left flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-veyra-muted truncate">
                <UserIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {currentUser ? (
                    <>Sesión: <span className="text-veyra-text font-medium">{currentUser.email}</span></>
                  ) : (
                    <span className="text-veyra-subtle">Sin sesión iniciada</span>
                  )}
                </span>
              </div>
              {!currentUser && (
                <span className="text-[11px] text-accent font-medium shrink-0">
                  Requiere entrar
                </span>
              )}
            </div>

            {/* Error banner if accept failed */}
            {acceptError && (
              <div className="w-full mt-4 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-left">
                {acceptError}
              </div>
            )}

            {/* Primary Action Button */}
            <div className="w-full mt-6 flex flex-col gap-3">
              <Button
                variant="primary"
                size="lg"
                loading={isAccepting}
                onClick={handleAccept}
                className="w-full text-sm font-semibold flex items-center justify-center gap-2 bg-accent hover:opacity-95 text-white"
              >
                {isAccepting ? (
                  'Uniéndote al recurso...'
                ) : (
                  <>
                    <span>Aceptar e Ir al recurso</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setCode('');
                  setInputCode('');
                  setInvitation(null);
                  navigateTo('/join');
                }}
                className="text-xs text-veyra-subtle hover:text-veyra-text transition-colors cursor-pointer py-1"
              >
                Ingresar otro código
              </button>
            </div>
          </div>
        ) : (
          /* Estado Sin Código: Formulario para pegar o ingresar código */
          <div className="w-full max-w-md bg-veyra-card border border-veyra-border rounded-xl p-8 shadow-elevated flex flex-col items-center text-center animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
              <Share2 className="w-6 h-6 text-accent" />
            </div>

            <h2 className="text-xl font-bold tracking-tight text-veyra-text mb-1">
              Unirse a un recurso
            </h2>
            <p className="text-xs text-veyra-muted mb-6 max-w-xs leading-relaxed">
              Introduce el código de invitación o enlace compartido desde la aplicación móvil o web.
            </p>

            <form onSubmit={handleManualSubmit} className="w-full space-y-4 text-left">
              <div>
                <label
                  htmlFor="join-code"
                  className="block text-xs font-medium text-veyra-muted mb-1.5"
                >
                  Código de invitación
                </label>
                <div className="relative flex items-center">
                  <input
                    id="join-code"
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="Ej. 64ebecdcd6d3"
                    className="w-full bg-veyra-canvas border border-veyra-border text-veyra-text placeholder:text-veyra-subtle rounded-md px-3.5 py-2.5 text-sm font-mono tracking-wider transition-all focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent pr-10"
                  />
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    title="Pegar del portapapeles"
                    className="absolute right-2 p-1.5 rounded text-veyra-muted hover:text-accent hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <ClipboardPaste className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2.5">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={!inputCode.trim()}
                  className="w-full font-semibold"
                >
                  Verificar invitación
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handlePasteClipboard}
                  className="w-full text-xs text-veyra-muted hover:text-veyra-text flex items-center justify-center gap-2"
                >
                  <ClipboardPaste className="w-4 h-4 text-accent" />
                  <span>Pegar código de invitación</span>
                </Button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-xs text-veyra-subtle py-2">
        <p>Veyra — Colaboración Segura en Tiempo Real</p>
      </footer>
    </div>
  );
};
