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

      <footer className="relative z-10 mt-8 text-center text-xs text-veyra-subtle">
        <p>Veyra — Sincronización Web en Tiempo Real</p>
      </footer>
    </div>
  );
};

