import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { supabase } from '../../lib/supabase';

export const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if session exists or hash contains recovery token
  useEffect(() => {
    // Supabase handles session recovery from url hash automatically
    const checkRecovery = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session && !window.location.hash.includes('access_token')) {
        // If no session and no hash, notify user
        setErrorMsg('El enlace de recuperación es inválido o ha expirado. Por favor solicita uno nuevo.');
      }
    };
    checkRecovery();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setErrorMsg('Por favor completa todos los campos.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err: unknown) {
      console.error('[ResetPasswordPage] Update password error:', err);
      setErrorMsg((err as Error).message || 'Error al actualizar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-veyra-canvas flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-veyra-teal/10 rounded-full blur-[140px] pointer-events-none" />

      <main className="relative z-10 w-full flex justify-center">
        <div className="w-full max-w-sm bg-veyra-card border border-veyra-border rounded-xl p-7 shadow-elevated">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-10 h-10 rounded-md bg-veyra-elevated border border-veyra-border flex items-center justify-center mb-3">
              <svg className="w-7 h-7" viewBox="0 0 100 100" fill="none">
                <path
                  d="M28 32 L50 72 L72 32"
                  stroke="hsl(180, 49%, 45%)"
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="50" cy="40" r="6" fill="#fcfcfc" />
              </svg>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-veyra-text">
              Restablecer Contraseña
            </h2>
            <p className="text-xs text-veyra-muted mt-1">
              Ingresa tu nueva contraseña para acceder a Veyra
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {errorMsg}
            </div>
          )}

          {success ? (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-xs font-semibold text-emerald-400">
                ¡Contraseña actualizada con éxito!
              </p>
              <p className="text-[11px] text-veyra-muted">
                Redirigiendo a tu espacio de trabajo...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nueva Contraseña"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
                required
              />

              <Input
                label="Confirmar Nueva Contraseña"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
                required
              />

              <Button
                type="submit"
                loading={loading}
                className="w-full mt-2"
                size="md"
              >
                <span>Guardar Contraseña</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-veyra-border text-center">
            <a
              href="/"
              className="text-xs text-veyra-muted hover:text-teal-400 transition-colors"
            >
              Volver al inicio de sesión
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};

