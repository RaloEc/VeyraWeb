import React from 'react';
import { LoginCard } from './LoginCard';

export const AuthPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-veyra-canvas flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Subtle ambient teal background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-veyra-teal/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-veyra-elevated/40 rounded-full blur-[100px] pointer-events-none" />

      <main className="relative z-10 w-full flex justify-center">
        <LoginCard />
      </main>

      <footer className="relative z-10 mt-8 text-center text-xs text-veyra-subtle space-y-2">
        <p>Veyra — Notas, Recordatorios y Agenda en Tiempo Real</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-veyra-muted">
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-teal-400 transition-colors">
            Política de Privacidad
          </a>
          <span aria-hidden="true">•</span>
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-teal-400 transition-colors">
            Términos de Servicio
          </a>
          <span aria-hidden="true">•</span>
          <a href="/delete-account" target="_blank" rel="noopener noreferrer" className="hover:text-teal-400 transition-colors">
            Eliminar cuenta
          </a>
        </div>
      </footer>
    </div>
  );
};

