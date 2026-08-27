'use client';

import { ViewModeProvider } from '@/lib/view-mode';

export function Providers({ children }: { children: React.ReactNode }) {
  return <ViewModeProvider>{children}</ViewModeProvider>;
}
