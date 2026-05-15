import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useProjects, relativeTime } from '../../../hooks/useProjects';

export default function ProjectsApp() {
  const { payload, error } = useProjects();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!payload) return [];
    if (!query) return payload.repos;
    const q = query.toLowerCase();
    return payload.repos.filter((r) =>
      `${r.name} ${r.description ?? ''} ${r.language ?? ''}`.toLowerCase().includes(q),
    );
  }, [payload, query]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-void)] text-[var(--color-text)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-panel)]/80 px-5 py-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[0.25em] text-[var(--color-amber)] uppercase">
              Projects
            </div>
            <h2 className="mt-0.5 text-lg font-[var(--font-display)] font-semibold">
              github.com/schmug
            </h2>
          </div>
          {payload && (
            <span className="font-mono text-[10px] text-[var(--color-muted)]">
              {filtered.length} / {payload.repos.length}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-shadow)] px-3 py-1.5 transition-shadow duration-200 focus-within:border-[var(--color-amber)] focus-within:ring-1 focus-within:ring-[var(--color-amber)]">
          <span className="font-mono text-[11px] text-[var(--color-amber)]">›</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, language, or description"
            className="flex-1 bg-transparent text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
            aria-label="Filter projects"
            maxLength={100} // Security: prevent DoS via extremely long input strings
          />
          {query && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="rounded-sm text-[var(--color-muted)] hover:text-[var(--color-amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-amber)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {error && (
          <div className="rounded-md border border-[var(--color-hot)]/40 bg-[var(--color-hot)]/5 p-4 text-xs text-[var(--color-dim)]">
            Couldn't load repos ({error}). Visit{' '}
            <a
              href="https://github.com/schmug"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-amber)] hover:underline"
            >
              github.com/schmug
            </a>{' '}
            directly.
          </div>
        )}
        {!error && !payload && (
          <div className="flex h-full items-center justify-center font-mono text-xs text-[var(--color-muted)]">
            loading repos…
          </div>
        )}
        {payload && (
          <ul className="divide-y divide-[var(--color-border)]">
            {filtered.length === 0 && (
              <li className="py-6 text-center text-xs text-[var(--color-muted)]">
                No repos match "<span className="font-mono text-[var(--color-text)]">{query}</span>
                ".
              </li>
            )}
            {filtered.map((repo) => (
              <li key={repo.name}>
                <a
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md px-1 py-2 transition hover:bg-[var(--color-panel-hi)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-amber)]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-amber)]">
                      {repo.name}
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                      {repo.language ?? '—'}
                    </span>
                  </div>
                  {repo.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--color-dim)]">
                      {repo.description}
                    </p>
                  )}
                  <div className="mt-1 flex gap-3 font-mono text-[10px] text-[var(--color-muted)]">
                    <span>★ {repo.stargazers_count}</span>
                    <span>{relativeTime(repo.updated_at)}</span>
                    {repo.homepage && <span className="text-[var(--color-amber)]/80">live ↗</span>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {payload && (
        <footer className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-shadow)] px-5 py-2 font-mono text-[10px] text-[var(--color-muted)]">
          cached at {new Date(payload.fetchedAt).toLocaleString()}
        </footer>
      )}
    </div>
  );
}
