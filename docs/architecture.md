# CortechOS architecture

Reference for how the _implemented_ code is structured — file map, store shape, app contract, deploy contract. For the original design rationale and product goals, see [`docs/superpowers/specs/2026-04-12-cortechos-design.md`](./superpowers/specs/2026-04-12-cortechos-design.md).

## Layering

The site is one Astro page (`src/pages/index.astro`) that ships **two layers**:

1. **Static SEO layer** (`#static-layer`) — server-rendered HTML with the headline, product list, and footer. Visible to crawlers and to `<noscript>` users. Hidden by an inline `<style>` block once `js` is added to the `<html>` element.
2. **React island** (`#root-shell`) — a single `client:only="react"` mount point hydrating `src/components/RootShell.tsx`. The island chooses between `OSShell` (desktop OS) and `MobileShell` (vertical card grid) using `window.matchMedia('(max-width: 767px)')`. Both shells are `lazy()`-imported so each client only downloads what it renders.

`astro.config.mjs` is `output: 'static'` — the build emits plain HTML/JS into `dist/` with no SSR adapter.

## App registry

Source: [`src/apps/registry.ts`](../src/apps/registry.ts). Every window on the desktop is one entry in this array.

```ts
type AppManifest = {
  id: string;
  name: string;
  description: string;
  icon: string | ReactNode;
  type: 'iframe' | 'native';
  url?: string; // iframe only
  component?: () => Promise<{ default: ComponentType }>; // native only
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  allowMultiple?: boolean; // false → singleton (focus existing instance instead of opening a new one)
  githubRepo?: string; // owner/repo, displayed in window chrome / about page
  paid?: boolean; // shown with a "PAID" badge in launcher and desktop
};
```

**Iframe apps** (4): `dmarc.mx`, `donthype.me`, `apartment-stager`, `q-r.contact`. Hosted elsewhere; embedded as-is. Each must allow framing (no `X-Frame-Options: DENY`, no restrictive CSP `frame-ancestors`) — the iframe-embed Playwright suite enforces this.

**Native apps** (3): `About Schmug`, `Support`, `Projects`. Each is a lazy-imported React component under `src/components/os/apps/`.

To **add an app**: append one entry to the array. No other code changes needed — the launcher, desktop icons, and taskbar pick it up automatically.

## Window manager

Source: [`src/components/os/store.ts`](../src/components/os/store.ts). A zustand store with `persist` middleware.

**State:**

```ts
type OSState = {
  windows: WindowState[];
  focusedId: string | null;
  nextZ: number; // monotonic z-counter; never reset
  hasBooted: boolean; // gates the boot splash and the first-visit auto-open
};
```

**Actions:** `openApp`, `closeWindow`, `focusWindow`, `minimizeWindow`, `restoreWindow`, `toggleMaximize`, `moveWindow`, `resizeWindow`, `setBooted`, `resetLayout`.

**Cascade placement.** New windows offset 24 + (n × 28) px from the top-left, modulo 8 — so the 9th window restarts the cascade rather than walking off-screen.

**Singleton apps** (`allowMultiple: false`). `openApp` checks for an existing window with the same `appId`; if one exists it focuses (and un-minimizes) it instead of opening a duplicate. The instance ID for singletons equals the `appId` so they survive reload.

**Z-order.** Every `focusWindow` increments `nextZ` and assigns it to the focused window. On close, focus shifts to whichever remaining window has the highest `z`. Minimizing clears focus only if the minimized window held it.

**Persistence.** `persist` middleware, key `'cortechos:layout'`, `localStorage` storage. `partialize` keeps `windows`, `nextZ`, and `hasBooted` — `focusedId` is intentionally dropped so reload starts unfocused. To wipe state during dev: `localStorage.removeItem('cortechos:layout')` then reload.

## A11y contract

| Feature          | Where                   | Behavior                                                                                                                                                                    |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip link        | `OSShell.tsx`           | `sr-only` link "Skip to desktop icons" — visible on focus, jumps to `#ct-desktop-icons`.                                                                                    |
| App role         | `OSShell.tsx`           | Desktop container has `role="application"` + `aria-label="CortechOS desktop"`.                                                                                              |
| Window semantics | `Window.tsx`            | Each window is `role="group"` with `aria-label="{title} window"`. Control buttons (Close, Minimize, Maximize/Restore) have explicit `aria-label`s; icons are `aria-hidden`. |
| Live announcer   | `OSShell.tsx`           | Hidden `role="status" aria-live="polite"` region announces "{title} opened" / "Window closed" as the window list changes.                                                   |
| Launcher dialog  | `Launcher.tsx`          | `role="dialog" aria-modal="true"`. Result list is `role="listbox"` with `role="option"` items. Tab is captured to keep focus on the search input — arrow keys walk results. |
| Boot splash      | `BootSplash.tsx`        | Press any key or click to skip. Honors `prefers-reduced-motion` (`window.matchMedia`).                                                                                      |
| Reduced motion   | `src/styles/global.css` | `@media (prefers-reduced-motion: reduce)` disables animations globally.                                                                                                     |
| Keyboard         | `useKeyboard.ts`        | `⌘K` / `Ctrl+K` toggles launcher. `⌘W` / `Ctrl+W` closes the focused window. `Esc` closes the launcher.                                                                     |

## Deploy contract

Cloudflare Pages, Framework preset **None**:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** `>=22.12.0` (from `package.json#engines`).

`public/_routes.json` is committed:

```json
{ "version": 1, "include": [], "exclude": ["/*"] }
```

This tells Pages to **bypass the Functions runtime entirely** — every path is served as a static asset from the edge cache. We had a runtime regression that this file fixed; do not delete it without re-testing the deploy.

There is intentionally **no `public/_headers`** file. The site has no custom CSP, no auth-only paths, and no cache overrides. If you add one, document why here.

## Testing

| Suite                                      | Command             | Where                                                       |
| ------------------------------------------ | ------------------- | ----------------------------------------------------------- |
| Unit (zustand store, helpers)              | `npm test`          | `src/**/*.test.ts` (e.g. `src/components/os/store.test.ts`) |
| End-to-end (desktop, mobile, iframe embed) | `npm run test:e2e`  | `e2e/smoke.spec.ts`                                         |
| Type & Astro check                         | `npm run typecheck` | `astro check && tsc --noEmit`                               |

The desktop e2e spins up the dev server (`webServer` in `playwright.config.ts`), boots the OS, opens windows via icon and launcher, and asserts no unexpected console errors. The iframe-embed spec opens each iframe app and fails if any returns `X-Frame-Options` / CSP refusal — that's how iframe regressions surface.

To regenerate the README hero screenshot: `npm run dev` in one shell, then `node scripts/capture-screenshot.mjs` — writes `docs/screenshot-desktop.png`.

## File map

```
src/
├─ apps/registry.ts            # AppManifest type + the apps array
├─ components/
│  ├─ RootShell.tsx            # picks OSShell vs MobileShell at 767px
│  ├─ os/
│  │  ├─ OSShell.tsx           # desktop layout, skip link, live announcer, viewport tracking
│  │  ├─ Desktop.tsx           # desktop icons grid
│  │  ├─ WindowManager.tsx     # renders react-rnd windows from store.windows
│  │  ├─ Window.tsx            # window chrome (titlebar, controls, role="group")
│  │  ├─ Taskbar.tsx           # launcher button + open windows + clock
│  │  ├─ Launcher.tsx          # ⌘K dialog with search and keyboard nav
│  │  ├─ BootSplash.tsx        # one-time boot animation
│  │  ├─ ContextMenu.tsx       # desktop right-click menu
│  │  ├─ store.ts              # zustand window-manager store (persisted)
│  │  ├─ store.test.ts         # vitest coverage for store actions
│  │  ├─ useKeyboard.ts        # global keyboard shortcuts
│  │  └─ apps/                 # AboutApp, SupportApp, ProjectsApp (lazy-loaded)
│  └─ mobile/MobileShell.tsx   # vertical card grid for <768px
├─ hooks/                      # shared React hooks
├─ layouts/                    # Astro layouts
├─ lib/                        # shared utilities
├─ pages/                      # Astro routes (index.astro is the only interactive page)
└─ styles/global.css           # Tailwind v4 entry + reduced-motion overrides
```

## Conventions worth knowing

- **No `index.ts` barrels.** Import from concrete files; it keeps the Astro/Vite dependency graph small.
- **Window-relative units come from the store, not from CSS.** Resizing a window updates `w`/`h` in the store; react-rnd reads them as props. Don't try to drive sizes from CSS or you'll desync the layout.
- **Iframe apps must be served from a publicly framable origin.** When adding one, run `npm run test:e2e` — the iframe-embed suite surfaces XFO/CSP refusals.
- **`useOS.getState()` outside React is fine** for one-shot side effects (e.g. the first-visit About auto-open in `OSShell.tsx`). Don't subscribe via `getState` — use the hook.

## Mythos tracker

A scheduled workflow (`.github/workflows/mythos.yml`) runs daily at 19:00 UTC. It diffs Anthropic's CVD payload against `src/content/mythos/_data/snapshot.json` and, when meaningful deltas fire, generates a post via the Anthropic SDK, writes it to `src/content/mythos/`, and opens an auto-merge PR.

- All logic lives in `scripts/mythos/*.ts`; the YAML is thin.
- Pure modules (`digest.ts`, `triggers.ts`, `generate.ts` guardrails) are unit-tested with vitest.
- `claude-sonnet-4-6` is the default model; cost is roughly cents per delta day.
- Slop guardrails (in `generate.ts`) reject hallucinated CVE IDs, missing required CVEs, and out-of-band word counts. A guardrail failure opens a GitHub issue instead of merging a bad post.
- `ANTHROPIC_API_KEY` must be set in repo Settings → Secrets → Actions.
- Spec: [`docs/superpowers/specs/2026-05-24-mythos-tracker-design.md`](./superpowers/specs/2026-05-24-mythos-tracker-design.md). Plan: [`docs/superpowers/plans/2026-05-24-mythos-tracker.md`](./superpowers/plans/2026-05-24-mythos-tracker.md).
