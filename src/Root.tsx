import { lazy, Suspense, useEffect, useState } from 'react';
import LandingPage from './LandingPage';
import { shouldShowAppForHash } from './lib/appRoute';

const App = lazy(() => import('./App'));

function getCurrentHash() {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

export default function Root() {
  const [showApp, setShowApp] = useState(() => shouldShowAppForHash(getCurrentHash()));

  useEffect(() => {
    const handleHashChange = () => {
      setShowApp(shouldShowAppForHash(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (!showApp) return <LandingPage />;

  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-black font-mono text-sm uppercase tracking-[0.24em] text-brand">
        Loading ETHOS...
      </div>
    }>
      <App />
    </Suspense>
  );
}
