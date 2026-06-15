import { useEffect, useRef, useState } from 'react';
import { danceFrames, drawAsciiFrame } from '../../../lib/dmarcus/frames';
import { createChiptune } from '../../../lib/dmarcus/chiptune';

const CELL = 8;
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

export default function DmarcusApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const chiptuneRef = useRef<ReturnType<typeof createChiptune> | null>(null);

  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Frame playback (or a single static frame under reduced motion).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = `${Math.round(CELL * 1.25)}px ui-monospace, 'SF Mono', Menlo, monospace`;
    ctx.textBaseline = 'top';

    if (reduced) {
      drawAsciiFrame(ctx, danceFrames.dance[0], CELL);
      return;
    }

    const fps = (danceFrames.dance.length / danceFrames.meta.loopMs) * 1000;
    let raf = 0;
    let last = 0;
    let i = 0;
    const loop = (t: number) => {
      if (t - last >= 1000 / fps) {
        last = t;
        drawAsciiFrame(ctx, danceFrames.dance[i], CELL);
        i = (i + 1) % danceFrames.dance.length;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // Stop audio on unmount.
  useEffect(() => () => chiptuneRef.current?.stop(), []);

  const toggleAudio = () => {
    if (playing) {
      chiptuneRef.current?.stop();
      chiptuneRef.current = null;
      setPlaying(false);
    } else {
      chiptuneRef.current = createChiptune();
      chiptuneRef.current.play();
      setPlaying(true);
    }
  };

  const open = danceFrames.dance[0];

  return (
    <div className="flex h-full flex-col items-center justify-between gap-4 bg-[var(--color-void)] px-6 py-6 text-[var(--color-text)]">
      <div className="text-center">
        <div className="font-mono text-[11px] tracking-[0.3em] text-[var(--color-amber)] uppercase">
          DMarcus
        </div>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Guarded by DMarcus. Hyped by nobody.</p>
      </div>

      <div
        className="flex flex-1 items-center justify-center"
        aria-label="DMarcus the dmarcheck mascot, dancing"
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          width={open.w * CELL}
          height={open.h * CELL}
          className="[image-rendering:pixelated]"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleAudio}
          aria-pressed={playing}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)]/60 px-3 py-1.5 font-mono text-xs text-[var(--color-text)] transition hover:border-[var(--color-amber)]/60"
        >
          {playing ? '⏹ Stop the music' : '▶ Play the music'}
        </button>
        <a
          href={YT}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-[var(--color-amber)]/50 bg-[var(--color-panel)]/60 px-3 py-1.5 font-mono text-xs text-[var(--color-amber)] transition hover:bg-[var(--color-panel-hi)]"
        >
          Never gonna click this →
        </a>
      </div>
    </div>
  );
}
