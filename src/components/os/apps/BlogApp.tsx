import { useEffect, useMemo, useState } from 'react';
import { relativeTime } from '../../../hooks/useProjects';

type BlogPost = {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  updatedDate: string | null;
  tags: string[];
};

type BlogPayload = {
  posts: BlogPost[];
  fetchedAt: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export default function BlogApp() {
  const [payload, setPayload] = useState<BlogPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/blog.json', { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: BlogPayload) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!payload) return [];
    if (!query) return payload.posts;
    const q = query.toLowerCase();
    return payload.posts.filter((p) =>
      `${p.title} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(q),
    );
  }, [payload, query]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-void)] text-[var(--color-text)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-panel)]/80 px-5 py-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[0.25em] text-[var(--color-amber)] uppercase">
              Blog
            </div>
            <h2 className="mt-0.5 text-lg font-[var(--font-display)] font-semibold">
              cortech.online/blog
            </h2>
          </div>
          {payload && (
            <span className="font-mono text-[10px] text-[var(--color-muted)]">
              {filtered.length} / {payload.posts.length}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-shadow)] px-3 py-1.5 transition-shadow duration-200 focus-within:border-[var(--color-amber)] focus-within:ring-1 focus-within:ring-[var(--color-amber)]">
          <span className="font-mono text-[11px] text-[var(--color-amber)]">›</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title, tag, or summary"
            className="flex-1 bg-transparent text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
            aria-label="Filter posts"
            maxLength={100} // Security: prevent DoS via extremely long input strings
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {error && (
          <div className="rounded-md border border-[var(--color-hot)]/40 bg-[var(--color-hot)]/5 p-4 text-xs text-[var(--color-dim)]">
            Couldn't load posts ({error}). Visit{' '}
            <a href="/blog" className="text-[var(--color-amber)] hover:underline">
              /blog
            </a>{' '}
            directly.
          </div>
        )}
        {!error && !payload && (
          <div className="flex h-full items-center justify-center font-mono text-xs text-[var(--color-muted)]">
            loading posts…
          </div>
        )}
        {payload && payload.posts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-[var(--color-muted)]">
            <p>No posts published yet.</p>
            <p className="text-[var(--color-dim)]">
              Drafts and the post template live in{' '}
              <span className="font-mono">src/content/blog/</span>.
            </p>
          </div>
        )}
        {payload && payload.posts.length > 0 && (
          <ul className="divide-y divide-[var(--color-border)]">
            {filtered.length === 0 && (
              <li className="py-6 text-center text-xs text-[var(--color-muted)]">
                No posts match "<span className="font-mono text-[var(--color-text)]">{query}</span>
                ".
              </li>
            )}
            {filtered.map((post) => (
              <li key={post.slug}>
                <a
                  href={`/blog/${post.slug}/`}
                  className="block rounded-md px-1 py-3 transition hover:bg-[var(--color-panel-hi)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-amber)]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-[var(--font-display)] font-semibold text-[var(--color-text)] hover:text-[var(--color-amber)]">
                      {post.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                      {dateFormatter.format(new Date(post.pubDate))}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--color-dim)]">
                    {post.description}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 font-mono text-[10px] text-[var(--color-muted)]">
                    <span>{relativeTime(post.pubDate)}</span>
                    {post.tags.length > 0 && <span>{post.tags.join(' · ')}</span>}
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
