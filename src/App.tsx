import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './modules/auth/AuthPage';
import { ResetPasswordPage } from './modules/auth/ResetPasswordPage';
import { JoinPage } from './modules/join/JoinPage';
import { AppLayout } from './components/layout/AppLayout';
import { OnboardingModal } from './components/common/OnboardingModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ThemeProvider } from './theme/ThemeProvider';
import { UserSettingsProvider } from './context/UserSettingsContext';
import { Toaster } from 'sonner';

function AppContent() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname;
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // /reset-password route or recovery hash
  if (currentPath.startsWith('/reset-password') || (typeof window !== 'undefined' && window.location.hash.includes('type=recovery'))) {
    return (
      <ErrorBoundary>
        <ResetPasswordPage />
      </ErrorBoundary>
    );
  }

  // /join route - Accessible with or without active user session
  if (currentPath.startsWith('/join')) {
    return (
      <ErrorBoundary>
        <JoinPage currentUser={user} />
      </ErrorBoundary>
    );
  }

  // Loading Splash Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-md bg-surface border border-veyra-border flex items-center justify-center mb-4">
          <svg className="w-8 h-8" viewBox="0 0 100 100" fill="none">
            <path
              d="M28 32 L50 72 L72 32"
              stroke="var(--accent-primary, #60A5FA)"
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="50" cy="40" r="6" fill="#fcfcfc" />
          </svg>
        </div>
        <p className="text-xs font-medium text-veyra-muted tracking-wider uppercase">
          Iniciando Veyra...
        </p>
      </div>
    );
  }

  // Not authenticated -> Show Auth Page
  if (!user) {
    return <AuthPage />;
  }

  // Authenticated -> Show Main App Layout with ErrorBoundary and check Onboarding
  const needsOnboarding = profile && profile.onboarding_completed === false;

  return (
    <ErrorBoundary>
      <AppLayout user={user} profile={profile} onSignOut={signOut} />
      {needsOnboarding && (
        <OnboardingModal
          userId={user.id}
          userEmail={user.email || undefined}
          onComplete={refreshProfile}
        />
      )}
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <UserSettingsProvider>
        <AppContent />
        <Toaster
          richColors={false}
          closeButton
          position="bottom-right"
          toastOptions={{
            duration: 5000,
            classNames: {
              toast: 'veyra-toast',
              title: 'text-sm font-medium',
              description: 'text-xs opacity-70',
            },
          }}
        />
      </UserSettingsProvider>
    </ThemeProvider>
  );
}

export default App;
