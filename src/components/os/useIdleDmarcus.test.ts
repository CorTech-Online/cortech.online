import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIdleTimer } from './useIdleDmarcus';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createIdleTimer', () => {
  it('fires onIdle after idleMs', () => {
    const onIdle = vi.fn();
    createIdleTimer({ idleMs: 1000, reducedMotion: false, onIdle });
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('resets the countdown on activity', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer({ idleMs: 1000, reducedMotion: false, onIdle });
    vi.advanceTimersByTime(800);
    timer.notifyActivity();
    vi.advanceTimersByTime(800);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('never fires under reduced motion', () => {
    const onIdle = vi.fn();
    createIdleTimer({ idleMs: 1000, reducedMotion: true, onIdle });
    vi.advanceTimersByTime(10_000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
