import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import SatQueryLandingPage from './components/hero';
import AuthScreen from './components/authScreen';
import SatQueryChat from './components/chat';
import ProfilePage from './components/ProfilePage';
import { persistUi, readPersistedUi } from './lib/Sessionhelpers';

function AppInner() {
  const { user, loading } = useAuth();
  const [view, setView] = useState(() => {
    const saved = readPersistedUi().view;
    return saved === 'chat' || saved === 'profile' || saved === 'landing' ? saved : 'landing';
  });

  useEffect(() => {
    persistUi({ view });
  }, [view]);

  const go = (next) => setView(next);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <span className="font-['Space_Mono'] text-[12px] text-[#F2EDE6]/40 tracking-wider">
          LOADING…
        </span>
      </div>
    );
  }

  if (view === 'landing') {
    return <SatQueryLandingPage onLaunchDemo={() => go('chat')} />;
  }

  if (!user) {
    return <AuthScreen onBack={() => go('landing')} />;
  }

  return (
    <>
      <div className={view === 'profile' ? 'hidden' : ''}>
        <SatQueryChat onOpenProfile={() => go('profile')} />
      </div>
      {view === 'profile' && <ProfilePage onBack={() => go('chat')} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}