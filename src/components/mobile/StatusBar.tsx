import { useEffect, useState } from 'react';

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function StatusBar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      aria-label="Status bar"
      className="flex h-7 flex-none items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-shadow)]/95 px-4 font-mono text-[10px] tracking-[0.18em] text-[var(--color-muted)] uppercase backdrop-blur"
    >
      <span>CortechOS mobile</span>
      <time dateTime={now.toISOString()} className="text-[var(--color-dim)] tabular-nums">
        {formatTime(now)}
      </time>
    </div>
  );
}
