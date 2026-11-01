'use client';

import { ViewModeProvider } from '@/lib/view-mode';
import { CompanyScopeProvider } from '@/lib/company-scope';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ViewModeProvider>
      <CompanyScopeProvider>{children}</CompanyScopeProvider>
    </ViewModeProvider>
  );
}
