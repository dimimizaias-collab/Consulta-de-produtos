export function getAppVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION || '?';
}

// Selo global (login, mobile…). Some quando o cabeçalho desktop está na tela — lá a versão
// aparece numa moldura ao lado do botão de perfil (ver TopNav).
export function VersionBadge() {
  return (
    <span className="fixed top-1.5 right-2 z-[60] text-[10px] font-mono font-semibold text-on-surface/40 pointer-events-none select-none [body:has([data-app-header])_&]:hidden">
      v{getAppVersion()}
    </span>
  );
}
