import { useEffect, useState } from 'react';
import { apps } from '../../apps/registry';
import { renderIcon } from '../../apps/iconUtils';
import { useOS } from './store';

type Props = {
  onOpenLauncher: () => void;
};

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function Taskbar({ onOpenLauncher }: Props) {
  const windows = useOS((s) => s.windows);
  const focusedId = useOS((s) => s.focusedId);
  const focusWindow = useOS((s) => s.focusWindow);
  const minimizeWindow = useOS((s) => s.minimizeWindow);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const appMap = new Map(apps.map((a) => [a.id, a]));

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[100] flex h-[56px] items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-shadow)]/95 px-3 backdrop-blur">
      <button
        type="button"
        onClick={onOpenLauncher}
        className="group flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-amber)] hover:text-[var(--color-amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-amber)]"
        aria-label="Open launcher"
      >
        <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true">
          <rect
            x="3"
            y="3"
            width="26"
            height="26"
            rx="4"
            fill="#0b0d12"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M3 10 H29" stroke="currentColor" strokeWidth="2" />
          <circle cx="7" cy="6.5" r="1.25" fill="currentColor" />
          <circle cx="11" cy="6.5" r="1.25" fill="#5ee3d1" />
          <circle cx="15" cy="6.5" r="1.25" fill="#ff6a5c" />
        </svg>
        <span className="font-mono">cortech</span>
        <span className="hidden text-xs text-[var(--color-muted)] group-hover:text-[var(--color-amber)] sm:inline">
          ⌘K
        </span>
      </button>

      <div
        className="flex flex-1 items-center gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Running apps"
      >
        {windows.length === 0 && (
          <span className="px-2 font-mono text-[11px] text-[var(--color-muted)]">no apps open</span>
        )}
        {windows.map((win) => {
          const app = appMap.get(win.appId);
          const focused = win.id === focusedId && !win.minimized;
          return (
            <button
              key={win.id}
              type="button"
              role="tab"
              aria-selected={focused}
              onClick={() => {
                if (focused) minimizeWindow(win.id);
                else focusWindow(win.id);
              }}
              className={[
                'flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-amber)]',
                focused
                  ? 'border-[var(--color-amber)] bg-[var(--color-amber)]/10 text-[var(--color-amber)]'
                  : win.minimized
                    ? 'border-[var(--color-border)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-amber)]/40 hover:text-[var(--color-text)]'
                    : 'border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text)] hover:border-[var(--color-amber)]/40',
              ].join(' ')}
              title={app?.description ?? win.title}
            >
              <span aria-hidden="true">{renderIcon(win.icon, 'h-4 w-4')}</span>
              <span className="max-w-[140px] truncate">{win.title}</span>
              {win.minimized && <span className="font-mono text-[9px] uppercase">min</span>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 px-1">
        <a
          href="https://github.com/schmug"
          rel="noopener noreferrer"
          target="_blank"
          className="rounded-sm font-mono text-[11px] text-[var(--color-muted)] transition hover:text-[var(--color-amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-amber)]"
          title="github.com/schmug"
        >
          /schmug
        </a>
        <time
          dateTime={now.toISOString()}
          className="font-mono text-xs text-[var(--color-dim)] tabular-nums"
        >
          {formatTime(now)}
        </time>
      </div>
    </div>
  );
}
