'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

export type ViewModePreference = 'auto' | 'mobile' | 'desktop';

interface ViewModeContextType {
  /** true = layout mobile ativo, false = layout desktop ativo */
  isMobileView: boolean;
  /** preferência salva pelo usuário */
  preference: ViewModePreference;
  /** alterna entre mobile e desktop e persiste no localStorage */
  toggleMode: () => void;
}

const ViewModeContext = createContext<ViewModeContextType>({
  isMobileView: false,
  preference: 'auto',
  toggleMode: () => {},
});

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const autoIsMobile = useIsMobile();

  // Lê o atributo data-view-mode injetado pelo script inline em layout.tsx
  // antes da hidratação do React, eliminando o flash de layout.
  const [preference, setPreference] = useState<ViewModePreference>(() => {
    if (typeof window === 'undefined') return 'auto';
    const attr = document.documentElement.getAttribute(
      'data-view-mode'
    ) as ViewModePreference | null;
    if (attr === 'mobile' || attr === 'desktop') return attr;
    return 'auto';
  });

  const isMobileView =
    preference === 'auto' ? autoIsMobile : preference === 'mobile';

  const toggleMode = () => {
    const next: ViewModePreference = isMobileView ? 'desktop' : 'mobile';
    setPreference(next);
    document.documentElement.setAttribute('data-view-mode', next);
    try {
      localStorage.setItem('view-mode', next);
    } catch {}
  };

  return (
    <ViewModeContext.Provider value={{ isMobileView, preference, toggleMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
