import { useCallback, useEffect, useRef, useState } from 'react';
import { WindowManager } from './WindowManager';
import { Desktop } from './Desktop';
import { Taskbar } from './Taskbar';
import { Launcher } from './Launcher';
import { BootSplash } from './BootSplash';
import { IdleDmarcus } from './IdleDmarcus';
import { useGlobalShortcuts } from './useKeyboard';
import { useOS } from './store';
import { apps } from '../../apps/registry';

const TASKBAR_H = 56;
const ABOUT_MARGIN = 32;

function aboutStartPosition(viewport: { w: number; h: number }, w: number, h: number) {
  const x = Math.max(8, Math.min(viewport.w - w - ABOUT_MARGIN, viewport.w - w - 8));
  const y = Math.max(8, Math.min(ABOUT_MARGIN, viewport.h - h - 8));
  return { x, y };
}

export default function OSShell() {
  const [viewport, setViewport] = useState({ w: 1200, h: 700 });
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const lastWindowIds = useRef<string[]>([]);
  const windows = useOS((s) => s.windows);
  const wasFirstBoot = useRef<boolean>(!useOS.getState().hasBooted);
  const autoOpenedAbout = useRef(false);
  const hasBooted = useOS((s) => s.hasBooted);

  const toggleLauncher = useCallback(() => setLauncherOpen((v) => !v), []);
  const closeLauncher = useCallback(() => setLauncherOpen(false), []);

  useGlobalShortcuts(toggleLauncher, closeLauncher);

  useEffect(() => {
    const deriveViewport = () => {
      const el = document.getElementById('ct-desktop');
      if (!el) return;
      setViewport({ w: el.clientWidth, h: Math.max(200, el.clientHeight - TASKBAR_H) });
    };
    deriveViewport();
    window.addEventListener('resize', deriveViewport);
    return () => window.removeEventListener('resize', deriveViewport);
  }, []);

  useEffect(() => {
    const prev = lastWindowIds.current;
    const curr = windows.map((w) => w.id);
    const opened = curr.filter((id) => !prev.includes(id));
    const closed = prev.filter((id) => !curr.includes(id));
    if (opened.length > 0) {
      const w = windows.find((w) => w.id === opened[0]);
      if (w) setAnnouncement(`${w.title} opened`);
    } else if (closed.length > 0) {
      setAnnouncement('Window closed');
    }
    lastWindowIds.current = curr;
  }, [windows]);

  useEffect(() => {
    if (!hasBooted) return;
    if (!wasFirstBoot.current) return;
    if (autoOpenedAbout.current) return;
    if (viewport.w <= 0 || viewport.h <= 0) return;

    const aboutApp = apps.find((a) => a.id === 'about');
    if (!aboutApp) return;

    const { x, y } = aboutStartPosition(viewport, aboutApp.defaultSize.w, aboutApp.defaultSize.h);
    useOS.getState().openApp(aboutApp, { x, y, focus: false });
    autoOpenedAbout.current = true;
  }, [hasBooted, viewport]);

  return (
    <div
      id="ct-desktop"
      className="ct-backdrop relative h-[100dvh] w-full overflow-hidden"
      aria-label="CortechOS desktop"
      role="application"
    >
      <a
        href="#ct-desktop-icons"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[400] focus:rounded focus:bg-[var(--color-amber)] focus:px-3 focus:py-1 focus:text-[var(--color-void)] focus:outline-none"
      >
        Skip to desktop icons
      </a>

      <div className="absolute inset-x-0 top-0 bottom-[56px]" id="ct-desktop-icons">
        <Desktop />
        <WindowManager viewport={viewport} />
      </div>
      <Taskbar onOpenLauncher={toggleLauncher} />
      <Launcher open={launcherOpen} onClose={closeLauncher} />
      <BootSplash />
      <IdleDmarcus />

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
