export function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || '?';
  return (
    <span className="fixed top-1.5 right-2 z-[60] text-[10px] font-mono font-semibold text-on-surface/40 pointer-events-none select-none">
      v{version}
    </span>
  );
}
