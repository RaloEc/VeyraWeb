import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AccountSwitchConfirmationError,
  connectGoogleDrivePopup,
  disconnectGoogleDrive,
  getMyGoogleIntegration,
  type GoogleIntegrationInfo,
} from '../../lib/googleDriveIntegration';
import { GoogleIcon } from './GoogleIcon';

export const IntegrationsSettingsPanel: React.FC = () => {
  const [integration, setIntegration] = useState<GoogleIntegrationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'connect' | 'disconnect' | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState<{
    currentEmail: string | null;
    newEmail: string | null;
    affectedAttachments: number;
  } | null>(null);

  const loadIntegration = useCallback(async () => {
    setLoading(true);
    try {
      const info = await getMyGoogleIntegration();
      setIntegration(info);
    } catch (err: unknown) {
      console.error('[IntegrationsSettingsPanel] load error:', err);
      toast.error((err as Error).message || 'No se pudo cargar el estado de Google Drive.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  const handleConnect = async (confirmAccountSwitch = false) => {
    setBusyAction('connect');
    setSwitchPrompt(null);
    try {
      const res = await connectGoogleDrivePopup({ confirmAccountSwitch });
      await loadIntegration();
      if (res.recovered_attachments > 0) {
        toast.success(
          `Google Drive conectado (${res.google_email || 'cuenta Google'}). Se restauraron ${res.recovered_attachments} adjuntos.`,
        );
      } else {
        toast.success(
          res.google_email
            ? `Google Drive conectado (${res.google_email}).`
            : 'Google Drive conectado correctamente.',
        );
      }
    } catch (err: unknown) {
      if (err instanceof AccountSwitchConfirmationError) {
        setSwitchPrompt({
          currentEmail: err.currentEmail,
          newEmail: err.newEmail,
          affectedAttachments: err.affectedAttachments,
        });
        return;
      }
      toast.error((err as Error).message || 'No se pudo conectar Google Drive.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnect = async () => {
    setBusyAction('disconnect');
    try {
      const res = await disconnectGoogleDrive();
      setShowDisconnectConfirm(false);
      await loadIntegration();
      toast.success(
        res.affected_attachments > 0
          ? `Google Drive desconectado. ${res.affected_attachments} adjunto(s) quedaron marcados como no disponibles.`
          : 'Google Drive desconectado correctamente.',
      );
    } catch (err: unknown) {
      toast.error((err as Error).message || 'No se pudo desconectar Google Drive.');
    } finally {
      setBusyAction(null);
    }
  };

  const isConnected = integration?.status === 'active';
  const needsReauth =
    integration?.status === 'needs_reauth' || integration?.status === 'revoked';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-veyra-text">Integraciones Externas</h4>
          <p className="text-[11px] text-veyra-muted mt-0.5">
            Conecta tu almacenamiento externo sin gastar tu cuota de Veyra Cloud. Este flujo es
            independiente del inicio de sesión.
          </p>
        </div>

        <button
          type="button"
          onClick={loadIntegration}
          disabled={loading || busyAction !== null}
          title="Actualizar estado"
          className="p-2 rounded-lg bg-veyra-card border border-veyra-border text-veyra-muted hover:text-veyra-text disabled:opacity-40 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tarjeta principal de Google Drive */}
      <div className="p-4 rounded-xl bg-veyra-card/80 border border-veyra-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-veyra-elevated border border-veyra-border flex items-center justify-center shrink-0">
              <GoogleIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h5 className="text-xs font-semibold text-veyra-text">Google Drive</h5>
                {loading ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-veyra-elevated text-veyra-muted">
                    Cargando...
                  </span>
                ) : isConnected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    Conectado
                  </span>
                ) : needsReauth ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-3 h-3" />
                    Requiere reconexión
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-veyra-elevated text-veyra-muted border border-veyra-border">
                    Desconectado
                  </span>
                )}
              </div>

              <p className="text-[11px] text-veyra-muted mt-0.5">
                {isConnected || needsReauth
                  ? integration?.google_email || 'Cuenta de Google autorizada'
                  : 'Adjunta archivos por referencia desde tu Drive (solo permiso drive.file)'}
              </p>
            </div>
          </div>

          {!loading && (!integration || integration.status === 'disconnected') && (
            <button
              type="button"
              onClick={() => handleConnect(false)}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {busyAction === 'connect' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <HardDrive className="w-3.5 h-3.5" />
              )}
              <span>Conectar Google Drive</span>
            </button>
          )}
        </div>

        {/* Estado Activo */}
        {!loading && isConnected && integration && (
          <div className="pt-3 border-t border-veyra-border/60 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-veyra-elevated/60 border border-veyra-border/60">
                <span className="block text-[10px] text-veyra-subtle uppercase tracking-wider">
                  Cuenta vinculada
                </span>
                <span className="font-medium text-veyra-text font-mono break-all">
                  {integration.google_email || integration.google_sub}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-veyra-elevated/60 border border-veyra-border/60">
                <span className="block text-[10px] text-veyra-subtle uppercase tracking-wider">
                  Conectado el
                </span>
                <span className="font-medium text-veyra-text">
                  {new Date(integration.connected_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {!showDisconnectConfirm ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10.5px] text-emerald-400/90">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Token cifrado en servidor (Vault) con alcance limitado drive.file
                </span>
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(true)}
                  disabled={busyAction !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Desconectar Drive</span>
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 space-y-2.5">
                <p className="text-[11px] text-red-300 leading-relaxed">
                  Al desconectar Google Drive se revocará el acceso y los adjuntos referenciados en
                  tus notas y recordatorios dejarán de mostrarse hasta que vuelvas a conectar la
                  misma cuenta.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDisconnectConfirm(false)}
                    disabled={busyAction === 'disconnect'}
                    className="px-3 py-1.5 rounded-lg bg-veyra-elevated text-veyra-muted hover:text-veyra-text text-xs transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={busyAction === 'disconnect'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busyAction === 'disconnect' && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Confirmar desconexión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Estado Requiere Reautenticación */}
        {!loading && needsReauth && (
          <div className="pt-3 border-t border-veyra-border/60 space-y-3">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 leading-relaxed">
              La autorización con Google Drive expiró o fue revocada
              {integration?.last_error_code ? ` (${integration.last_error_code})` : ''}. Vuelve a
              autorizar para restaurar tus adjuntos de Drive.
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busyAction !== null}
                className="px-3 py-1.5 rounded-lg bg-veyra-elevated text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors cursor-pointer"
              >
                Desconectar Drive
              </button>
              <button
                type="button"
                onClick={() => handleConnect(false)}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors cursor-pointer"
              >
                {busyAction === 'connect' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Reconectar Google Drive</span>
              </button>
            </div>
          </div>
        )}

        {/* Aviso si intentó cambiar a otra cuenta de Google con adjuntos activos */}
        {switchPrompt && (
          <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200 leading-relaxed">
                Ya tienes <strong>{switchPrompt.affectedAttachments}</strong> adjunto(s) vinculados
                a <strong>{switchPrompt.currentEmail || 'tu cuenta anterior'}</strong>. Si cambias
                a <strong>{switchPrompt.newEmail || 'la nueva cuenta'}</strong>, esos adjuntos
                quedarán marcados como no disponibles.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSwitchPrompt(null)}
                disabled={busyAction === 'connect'}
                className="px-3 py-1.5 rounded-lg bg-veyra-elevated text-veyra-muted hover:text-veyra-text text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConnect(true)}
                disabled={busyAction === 'connect'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                {busyAction === 'connect' && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Confirmar cambio de cuenta</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
