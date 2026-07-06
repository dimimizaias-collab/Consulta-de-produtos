'use client';

import { useEffect } from 'react';
import { ViewModeProvider } from '@/lib/view-mode';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return <ViewModeProvider>{children}</ViewModeProvider>;
}
