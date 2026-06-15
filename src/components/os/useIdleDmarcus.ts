import { useEffect, useState } from 'react';

export const IDLE_MS = 60_000;

export type IdleTimer = { notifyActivity: () => void; stop: () => void };

export function createIdleTimer(opts: {
  idleMs: number;
  reducedMotion: boolean;
  onIdle: () => void;
}): IdleTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (handle) {
      clearTimeout(handle);
      handle = null;
    }
  };
  const arm = () => {
    clear();
    if (opts.reducedMotion) return;
    handle = setTimeout(() => {
      handle = null;
      opts.onIdle();
    }, opts.idleMs);
  };
  arm();
  return { notifyActivity: arm, stop: clear };
}

export function useIdleDmarcus(): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = createIdleTimer({
      idleMs: IDLE_MS,
      reducedMotion: reduced,
      onIdle: () => setVisible(true),
    });
    const onActivity = () => {
      setVisible(false);
      timer.notifyActivity();
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    return () => {
      timer.stop();
      for (const e of events) window.removeEventListener(e, onActivity);
    };
  }, []);

  return { visible, dismiss: () => setVisible(false) };
}
