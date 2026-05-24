import { useEffect, useState } from 'react';

type MythosPayload = {
  snapshot: {
    as_of: string;
    headline: { disclosed: number; acknowledged: number; fixed: number; advisories: number };
    by_bug_class: Record<string, number>;
  };
  posts: Array<{
    slug: string;
    title: string;
    description: string;
    pubDate: string;
    triggers: string[];
  }>;
  fetchedAt: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

// Module-level cache to prevent duplicate fetches when the component
// unmounts and remounts (e.g., when the mythos window is closed and reopened).
let fetchPromise: Promise<MythosPayload> | null = null;
let cachedPayload: MythosPayload | null = null;

export default function MythosApp() {
  const [payload, setPayload] = useState<MythosPayload | null>(cachedPayload);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (cachedPayload) {
      setPayload(cachedPayload);
      return;
    }

    if (!fetchPromise) {
      // Security: timeout prevents DoS via hung network requests
      fetchPromise = fetch('/api/mythos.json', { signal: AbortSignal.timeout(10000) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: MythosPayload) => {
          cachedPayload = data;
          return data;
        })
        .catch((err) => {
          fetchPromise = null; // Allow retry on error
          throw err;
        });
    }

    fetchPromise
      .then((data: MythosPayload) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const topBugClasses = payload
    ? Object.entries(payload.snapshot.by_bug_class)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
    : [];

  return (
    <div className="flex h-full flex-col bg-[var(--color-void)] text-[var(--color-text)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-panel)]/80 px-5 py-3">
        <div className="font-mono text-[11px] tracking-[0.25em] text-[var(--color-amber)] uppercase">
          Mythos tracker
        </div>
        <h2 className="mt-0.5 text-lg font-[var(--font-display)] font-semibold">
          cortech.online/mythos
        </h2>
        {payload && (
          <p className="mt-0.5 font-mono text-[10px] text-[var(--color-muted)]">
            Snapshot as of {payload.snapshot.as_of}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <div className="rounded-md border border-[var(--color-hot)]/40 bg-[var(--color-hot)]/5 p-4 text-xs text-[var(--color-dim)]">
            Couldn't load Mythos data ({error}). Visit{' '}
            <a href="/mythos" className="text-[var(--color-amber)] hover:underline">
              /mythos
            </a>{' '}
            directly.
          </div>
        )}
        {!error && !payload && (
          <div className="flex h-full items-center justify-center font-mono text-xs text-[var(--color-muted)]">
            loading…
          </div>
        )}
        {payload && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['Disclosed', payload.snapshot.headline.disclosed],
                  ['Acknowledged', payload.snapshot.headline.acknowledged],
                  ['Patched', payload.snapshot.headline.fixed],
                  ['Advisories', payload.snapshot.headline.advisories],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="rounded border border-[var(--color-border)] p-3">
                  <div className="text-xl font-semibold">{n}</div>
                  <div className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            <h3 className="mt-6 text-sm font-semibold">Top bug classes</h3>
            {topBugClasses.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">No data yet.</p>
            ) : (
              <ul className="mt-2 font-mono text-xs">
                {topBugClasses.map(([k, n]) => (
                  <li
                    key={k}
                    className="flex justify-between border-b border-[var(--color-border)]/40 py-0.5"
                  >
                    <span>{k}</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mt-6 text-sm font-semibold">Recent posts</h3>
            {payload.posts.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">No posts yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-border)]">
                {payload.posts.slice(0, 10).map((p) => (
                  <li key={p.slug}>
                    <a
                      href={`/mythos/${p.slug}/`}
                      className="block rounded-md px-1 py-3 transition hover:bg-[var(--color-panel-hi)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-amber)]"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-[var(--font-display)] font-semibold text-[var(--color-text)] hover:text-[var(--color-amber)]">
                          {p.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                          {dateFormatter.format(new Date(p.pubDate))}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--color-dim)]">
                        {p.description}
                      </p>
                      {p.triggers.length > 0 && (
                        <div className="mt-1 font-mono text-[10px] text-[var(--color-muted)]">
                          {p.triggers.join(' · ')}
                        </div>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
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
