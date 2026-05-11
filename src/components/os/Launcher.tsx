import { useEffect, useMemo, useRef, useState } from 'react';
import { type AppManifest } from '../../apps/registry';
import { renderIcon } from '../../apps/iconUtils';
import { useAllApps } from '../../hooks/useAllApps';
import { useOS } from './store';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function matches(app: AppManifest, q: string) {
  if (!q) return true;
  const hay = `${app.name} ${app.description} ${app.id}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function Launcher({ open, onClose }: Props) {
  const apps = useAllApps();
  const openApp = useOS((s) => s.openApp);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => apps.filter((a) => matches(a, query)), [apps, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(0, filtered.length - 1));
  }, [filtered.length, selected]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[selected];
      if (target) {
        openApp(target);
        onClose();
      }
    } else if (e.key === 'Tab') {
      // Focus trap — keep the search input focused, walk the result list with arrows.
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="absolute inset-0 z-[150] flex items-start justify-center bg-[var(--color-void)]/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="App launcher"
    >
      <div
        className="mt-[15vh] w-[min(560px,90vw)] overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_var(--color-amber)_inset]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-panel-hi)] px-4 py-3 transition-shadow duration-200 focus-within:border-[var(--color-amber)] focus-within:ring-1 focus-within:ring-[var(--color-amber)]">
          <span className="font-mono text-xs text-[var(--color-amber)]">›</span>
          <div className="relative flex flex-1 items-center">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps…"
              className="w-full bg-transparent pr-6 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
              aria-label="Search apps"
              autoComplete="off"
              spellCheck={false}
              maxLength={100} // Security: prevent DoS via extremely long input strings
            />
            {query.length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-0 flex items-center justify-center rounded-sm p-1 text-[var(--color-muted)] hover:text-[var(--color-amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-amber)]"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
          <span className="font-mono text-[10px] text-[var(--color-muted)]">Esc</span>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-[var(--color-muted)]">
              No apps match "<span className="font-mono">{query}</span>".
            </li>
          )}
          {filtered.map((app, i) => (
            <li key={app.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  openApp(app);
                  onClose();
                }}
                className={[
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition',
                  i === selected
                    ? 'bg-[var(--color-amber)]/10 text-[var(--color-amber)]'
                    : 'text-[var(--color-text)]',
                ].join(' ')}
              >
                <span className="text-xl" aria-hidden="true">
                  {renderIcon(app.icon, 'h-6 w-6')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{app.name}</span>
                    <span className="font-mono text-[10px] text-[var(--color-muted)]">
                      /{app.id}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">
                    {app.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-shadow)] px-4 py-2 font-mono text-[10px] text-[var(--color-muted)]">
          <span>↑↓ navigate · ↵ open · Esc close</span>
          <span>
            {filtered.length} / {apps.length}
          </span>
        </div>
      </div>
    </div>
  );
}
