export function VersionBadge() {
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';
  return (
    <span className="fixed bottom-1.5 right-2 z-50 text-[9px] font-mono text-on-surface/25 pointer-events-none select-none">
      {sha}
    </span>
  );
}
