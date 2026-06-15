import { useEffect, useRef, useState } from 'react';
import { useIdleDmarcus } from './useIdleDmarcus';
import { danceFrames, drawAsciiFrame } from '../../lib/dmarcus/frames';
import { useOS } from './store';
import { apps } from '../../apps/registry';

const CELL = 5; // small corner overlay

export function IdleDmarcus() {
  const { visible, dismiss } = useIdleDmarcus();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [eyesClosed, setEyesClosed] = useState(false);
  const [entered, setEntered] = useState(false);

  // Gentle fade/slide entrance (disabled by the global reduced-motion rule).
  useEffect(() => {
    if (!visible) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // Occasional blink while visible.
  useEffect(() => {
    if (!visible) return;
    let openTimer: ReturnType<typeof setTimeout>;
    let closeTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 3000 + Math.random() * 3000;
      openTimer = setTimeout(() => {
        setEyesClosed(true);
        closeTimer = setTimeout(() => {
          setEyesClosed(false);
          schedule();
        }, 130);
      }, delay);
    };
    schedule();
    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    };
  }, [visible]);

  // Draw the current pose.
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = `${Math.round(CELL * 1.25)}px ui-monospace, 'SF Mono', Menlo, monospace`;
    ctx.textBaseline = 'top';
    drawAsciiFrame(ctx, eyesClosed ? danceFrames.idle.blink : danceFrames.idle.open, CELL);
  }, [visible, eyesClosed]);

  if (!visible) return null;
  const open = danceFrames.idle.open;
  const dmarcus = apps.find((a) => a.id === 'dmarcus');

  return (
    <button
      type="button"
      aria-label="Open DMarcus"
      onClick={() => {
        if (dmarcus) useOS.getState().openApp(dmarcus);
        dismiss();
      }}
      className={`absolute bottom-[68px] left-4 z-[300] cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/70 p-2 backdrop-blur transition-all duration-300 hover:border-[var(--color-amber)]/60 ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <canvas ref={canvasRef} aria-hidden="true" width={open.w * CELL} height={open.h * CELL} />
    </button>
  );
}
