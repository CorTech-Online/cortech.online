import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type HistoryRow = {
  date: string;
  disclosed: number;
  acknowledged: number;
  fixed: number;
  advisories: number;
  median_days_to_ack: number;
  median_days_to_patch: number;
  severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
};

type Props = { history: HistoryRow[] };

type View = 'funnel' | 'severity';

type SeriesKey = 'disclosed' | 'acknowledged' | 'fixed';

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'disclosed', label: 'Disclosed', color: 'var(--color-amber)' },
  { key: 'acknowledged', label: 'Acknowledged', color: 'var(--color-cyan)' },
  { key: 'fixed', label: 'Patched', color: 'var(--color-hot)' },
];

const SEVERITY_STACK: { key: keyof HistoryRow['severity']; label: string; color: string }[] = [
  { key: 'critical', label: 'Critical', color: '#ff6a5c' },
  { key: 'high', label: 'High', color: '#f6c34a' },
  { key: 'medium', label: 'Medium', color: '#5ee3d1' },
  { key: 'low', label: 'Low', color: '#7b9eff' },
  { key: 'unknown', label: 'Unknown', color: '#343a49' },
];

const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
const HEIGHT = 280;
const LAG_HEIGHT = 56;

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export default function Timeline({ history }: Props) {
  const [view, setView] = useState<View>('funnel');
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(320, Math.floor(w)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const n = history.length;

  const xFor = useCallback((i: number) => (n <= 1 ? 0 : (i / (n - 1)) * innerW), [n, innerW]);

  const yMax = useMemo(() => {
    if (view === 'severity') {
      return Math.max(
        1,
        ...history.map((r) => Object.values(r.severity).reduce((a, b) => a + b, 0)),
      );
    }
    const vals = history.flatMap((r) => [r.disclosed, r.acknowledged, r.fixed]);
    return Math.max(1, ...vals);
  }, [history, view]);

  const yFor = useCallback((v: number) => innerH - (v / yMax) * innerH, [innerH, yMax]);

  const linePath = useCallback(
    (key: SeriesKey) => {
      let d = '';
      history.forEach((row, i) => {
        const x = xFor(i);
        const y = yFor(row[key]);
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      });
      return d;
    },
    [history, xFor, yFor],
  );

  const gapAreaPath = useCallback(
    (top: SeriesKey, bottom: SeriesKey) => {
      let topPath = '';
      let botPath = '';
      history.forEach((row, i) => {
        const x = xFor(i);
        topPath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yFor(row[top]).toFixed(1);
      });
      for (let i = history.length - 1; i >= 0; i--) {
        const x = xFor(i);
        botPath += 'L' + x.toFixed(1) + ',' + yFor(history[i][bottom]).toFixed(1);
      }
      return topPath + botPath + 'Z';
    },
    [history, xFor, yFor],
  );

  const stackedSeries = useMemo(() => {
    if (view !== 'severity') return null;
    return history.map((row) => {
      let acc = 0;
      return SEVERITY_STACK.map((s) => {
        const v = row.severity[s.key];
        const seg = { y0: acc, y1: acc + v, color: s.color, label: s.label, value: v };
        acc += v;
        return seg;
      });
    });
  }, [history, view]);

  const severityAreaPaths = useMemo(() => {
    if (!stackedSeries) return [] as { color: string; label: string; d: string }[];
    return SEVERITY_STACK.map((s, sIdx) => {
      let top = '';
      let bot = '';
      stackedSeries.forEach((segs, i) => {
        const x = xFor(i);
        top += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yFor(segs[sIdx].y1).toFixed(1);
      });
      for (let i = stackedSeries.length - 1; i >= 0; i--) {
        const x = xFor(i);
        bot += 'L' + x.toFixed(1) + ',' + yFor(stackedSeries[i][sIdx].y0).toFixed(1);
      }
      return { color: s.color, label: s.label, d: top + bot + 'Z' };
    });
  }, [stackedSeries, xFor, yFor]);

  // Lag bar — twin sparklines
  const lagMax = useMemo(
    () => Math.max(1, ...history.map((r) => r.median_days_to_patch)) * 1.1,
    [history],
  );
  const lagPath = useCallback(
    (key: 'median_days_to_ack' | 'median_days_to_patch') => {
      let d = '';
      history.forEach((row, i) => {
        const x = xFor(i);
        const y = LAG_HEIGHT - (row[key] / lagMax) * LAG_HEIGHT;
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      });
      return d;
    },
    [history, xFor, lagMax],
  );

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    if (x < 0 || x > innerW || n <= 1) {
      setCursor(null);
      return;
    }
    const i = Math.round((x / innerW) * (n - 1));
    setCursor(Math.max(0, Math.min(n - 1, i)));
  };

  const handleLeave = () => setCursor(null);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setCursor((c) => {
        const step = e.shiftKey ? 7 : 1;
        const delta = e.key === 'ArrowLeft' ? -step : step;
        const start = c ?? n - 1;
        return Math.max(0, Math.min(n - 1, start + delta));
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursor(n - 1);
    } else if (e.key === 'Escape') {
      setCursor(null);
    }
  };

  const yTicks = useMemo(() => {
    const steps = 4;
    const out: number[] = [];
    for (let i = 0; i <= steps; i++) {
      out.push(Math.round((yMax / steps) * i));
    }
    return out;
  }, [yMax]);

  const xTicks = useMemo(() => {
    if (n === 0) return [] as { i: number; label: string }[];
    const count = Math.min(6, n);
    const out: { i: number; label: string }[] = [];
    for (let k = 0; k < count; k++) {
      const i = Math.round((k / (count - 1)) * (n - 1));
      out.push({ i, label: dateFmt.format(new Date(history[i].date)) });
    }
    return out;
  }, [n, history]);

  const active = cursor != null ? history[cursor] : history[history.length - 1];
  const ackGap = active ? active.disclosed - active.acknowledged : 0;
  const patchGap = active ? active.acknowledged - active.fixed : 0;

  const toggleSeries = (key: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      ref={wrapRef}
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-4"
      tabIndex={0}
      onKeyDown={onKey}
      role="figure"
      aria-label="Mythos vulnerability timeline. Use arrow keys to scrub days."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-shadow)] p-0.5 text-xs">
          {(['funnel', 'severity'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                'rounded px-2 py-1 font-mono tracking-wide uppercase ' +
                (view === v
                  ? 'bg-[var(--color-panel-hi)] text-[var(--color-text)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]')
              }
              aria-pressed={view === v}
            >
              {v === 'funnel' ? 'Funnel' : 'Severity bands'}
            </button>
          ))}
        </div>
        {view === 'funnel' && (
          <div className="flex flex-wrap gap-2 text-xs">
            {SERIES.map((s) => {
              const off = hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className={
                    'flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2 py-1 transition ' +
                    (off
                      ? 'opacity-40 hover:opacity-70'
                      : 'bg-[var(--color-shadow)] hover:bg-[var(--color-panel-hi)]')
                  }
                  aria-pressed={!off}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                    aria-hidden="true"
                  />
                  <span className="font-mono uppercase">{s.label}</span>
                  <span className="text-[var(--color-muted)]">{active?.[s.key] ?? 0}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Active day readout */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
        <span className="font-mono tracking-wide text-[var(--color-amber)] uppercase">
          {active ? dateFmt.format(new Date(active.date)) : '—'}
        </span>
        {view === 'funnel' ? (
          <>
            <span className="text-[var(--color-muted)]">
              Ack debt <span className="text-[var(--color-text)]">{ackGap.toLocaleString()}</span>
            </span>
            <span className="text-[var(--color-muted)]">
              Patch debt{' '}
              <span className="text-[var(--color-text)]">{patchGap.toLocaleString()}</span>
            </span>
            <span className="text-[var(--color-muted)]">
              Median patch lag{' '}
              <span className="text-[var(--color-text)]">
                {active?.median_days_to_patch.toFixed(1)}d
              </span>
            </span>
          </>
        ) : (
          <>
            {SEVERITY_STACK.filter((s) => s.key !== 'unknown').map((s) => (
              <span key={s.key} className="text-[var(--color-muted)]">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: s.color }}
                />
                {s.label}{' '}
                <span className="text-[var(--color-text)]">{active?.severity[s.key] ?? 0}</span>
              </span>
            ))}
          </>
        )}
      </div>

      {/* Main chart */}
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        className="mt-3 block"
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        role="img"
      >
        <g transform={`translate(${PAD.left} ${PAD.top})`}>
          {/* y grid */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={0}
                x2={innerW}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke="var(--color-border)"
                strokeDasharray="2 4"
                opacity={0.5}
              />
              <text
                x={-8}
                y={yFor(v)}
                dy="0.35em"
                textAnchor="end"
                fontSize={10}
                fill="var(--color-muted)"
                fontFamily="var(--font-mono)"
              >
                {v.toLocaleString()}
              </text>
            </g>
          ))}

          {view === 'funnel' ? (
            <>
              {/* gap fills */}
              {!hidden.has('disclosed') && !hidden.has('acknowledged') && (
                <path
                  d={gapAreaPath('disclosed', 'acknowledged')}
                  fill="var(--color-amber)"
                  opacity={0.12}
                />
              )}
              {!hidden.has('acknowledged') && !hidden.has('fixed') && (
                <path
                  d={gapAreaPath('acknowledged', 'fixed')}
                  fill="var(--color-cyan)"
                  opacity={0.12}
                />
              )}
              {/* lines */}
              {SERIES.map((s) =>
                hidden.has(s.key) ? null : (
                  <path
                    key={s.key}
                    d={linePath(s.key)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                  />
                ),
              )}
            </>
          ) : (
            <>
              {severityAreaPaths.map((p) => (
                <path key={p.label} d={p.d} fill={p.color} opacity={0.85} />
              ))}
            </>
          )}

          {/* x ticks */}
          {xTicks.map((t) => (
            <text
              key={t.i}
              x={xFor(t.i)}
              y={innerH + 16}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-muted)"
              fontFamily="var(--font-mono)"
            >
              {t.label}
            </text>
          ))}

          {/* cursor */}
          {cursor != null && (
            <g>
              <line
                x1={xFor(cursor)}
                x2={xFor(cursor)}
                y1={0}
                y2={innerH}
                stroke="var(--color-text)"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
              {view === 'funnel' &&
                SERIES.filter((s) => !hidden.has(s.key)).map((s) => (
                  <circle
                    key={s.key}
                    cx={xFor(cursor)}
                    cy={yFor(history[cursor][s.key])}
                    r={3.5}
                    fill="var(--color-void)"
                    stroke={s.color}
                    strokeWidth={2}
                  />
                ))}
            </g>
          )}
        </g>
      </svg>

      {/* Lag bar */}
      <div className="mt-2 border-t border-[var(--color-border)]/60 pt-2">
        <div className="flex items-center justify-between font-mono text-[10px] tracking-wide text-[var(--color-muted)] uppercase">
          <span>Median lag (days)</span>
          <span className="flex gap-3">
            <span>
              <span
                className="mr-1 inline-block h-1.5 w-3 align-middle"
                style={{ background: 'var(--color-cyan)' }}
              />
              ack {active?.median_days_to_ack.toFixed(2)}d
            </span>
            <span>
              <span
                className="mr-1 inline-block h-1.5 w-3 align-middle"
                style={{ background: 'var(--color-hot)' }}
              />
              patch {active?.median_days_to_patch.toFixed(1)}d
            </span>
          </span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${LAG_HEIGHT}`}
          width="100%"
          height={LAG_HEIGHT}
          className="block"
        >
          <g transform={`translate(${PAD.left} 0)`}>
            <path
              d={lagPath('median_days_to_patch')}
              fill="none"
              stroke="var(--color-hot)"
              strokeWidth={1.5}
            />
            <path
              d={lagPath('median_days_to_ack')}
              fill="none"
              stroke="var(--color-cyan)"
              strokeWidth={1.5}
            />
            {cursor != null && (
              <line
                x1={xFor(cursor)}
                x2={xFor(cursor)}
                y1={0}
                y2={LAG_HEIGHT}
                stroke="var(--color-text)"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
            )}
          </g>
        </svg>
      </div>

      <p className="mt-3 text-[10px] text-[var(--color-muted)]">
        Hover, click a legend chip, or focus the chart and use ← → (shift = week, home/end = bounds)
        to scrub.
      </p>
    </div>
  );
}
