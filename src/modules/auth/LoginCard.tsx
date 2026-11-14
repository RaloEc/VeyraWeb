import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { supabase } from '../../lib/supabase';

export interface LoginCardProps {
  onSuccess?: () => void;
}

export const LoginCard: React.FC<LoginCardProps> = ({ onSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Por favor ingresa tu correo electrónico.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setInfoMsg(null);

      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      setInfoMsg('Te hemos enviado un enlace a tu correo para restablecer tu contraseña.');
    } catch (err: unknown) {
      console.error('[LoginCard] Reset password error:', err);
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor completa todos los campos.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setInfoMsg(null);

      if (isSignUp) {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.session) {
          onSuccess?.();
        } else {
          setInfoMsg('¡Cuenta creada! Revisa tu correo o inicia sesión con tus credenciales.');
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onSuccess?.();
      }
    } catch (err: unknown) {
      console.error('[LoginCard] Auth error:', err);
      const message = (err as Error).message;
      if (message.includes('Invalid login credentials')) {
        setErrorMsg('Credenciales inválidas. Verifica tu correo y contraseña.');
      } else {
        setErrorMsg(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
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
          {isForgotPassword
            ? 'Recuperar contraseña'
            : isSignUp
            ? 'Crear cuenta en Veyra'
            : 'Bienvenido a Veyra'}
        </h2>
        <p className="text-xs text-veyra-muted mt-1">
          {isForgotPassword
            ? 'Te enviaremos las instrucciones a tu correo'
            : isSignUp
            ? 'Regístrate para organizar tu espacio de trabajo'
            : 'Inicia sesión con tu cuenta de Veyra'}
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {errorMsg}
        </div>
      )}

      {infoMsg && (
        <div className="mb-4 p-3 rounded-md bg-accent/10 border border-accent/20 text-accent text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{infoMsg}</span>
        </div>
      )}

      {isForgotPassword ? (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Input
            label="Correo electrónico"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            required
          />

          <Button
            type="submit"
            loading={loading}
            className="w-full mt-2"
            size="md"
          >
            <span>Enviar enlace</span>
            <ArrowRight className="w-4 h-4" />
          </Button>

          <button
            type="button"
            onClick={() => {
              setIsForgotPassword(false);
              setErrorMsg(null);
              setInfoMsg(null);
            }}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-veyra-muted hover:text-veyra-text transition-colors mt-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al inicio de sesión</span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Correo electrónico"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            required
          />

          <div>
            <Input
              label="Contraseña"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
              required
            />
            {!isSignUp && (
              <div className="text-right mt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  className="text-[11px] text-veyra-muted hover:text-teal-400 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}
          </div>

          <Button
            type="submit"
            loading={loading}
            className="w-full mt-2"
            size="md"
          >
            <span>{isSignUp ? 'Registrarse' : 'Iniciar Sesión'}</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>
      )}

      {!isForgotPassword && (
        <div className="mt-6 pt-5 border-t border-veyra-border text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
              setInfoMsg(null);
            }}
            className="text-xs text-veyra-muted hover:text-teal-400 transition-colors"
          >
            {isSignUp
              ? '¿Ya tienes una cuenta? Inicia sesión'
              : '¿No tienes cuenta? Regístrate aquí'}
          </button>
        </div>
      )}
    </div>
  );
};
