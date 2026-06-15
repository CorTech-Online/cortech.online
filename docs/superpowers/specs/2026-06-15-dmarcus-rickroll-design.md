# DMarcus's Big Number — an ASCILINE rickroll easter egg

**Date:** 2026-06-15
**Status:** Approved (design); spike validated the look at 64 cols.
**Spike artifacts (to be removed when this ships):** `scripts/dmarcus/spike.mjs`, `src/spike/dmarcus-frames.json`, `src/pages/dmarcus-spike.astro`.

## Problem / motivation

A "just for fun" addition to [cortech.online](https://cortech.online), sparked by [YusufB5/ASCILINE](https://github.com/YusufB5/ASCILINE) (a real-time video→ASCII renderer). ASCILINE itself is a server-side Python app (FastAPI + OpenCV + FFmpeg) and can't run on this static, Functions-disabled Cloudflare Pages site. But its _technique_ — luminance → character-ramp conversion — ports cleanly, and it pairs perfectly with **DMarcus**, the dmarcheck mascot, who is literally an orange `@` character with googly eyes and three legs. So the easter egg is: **DMarcus, rendered as ASCII art, dancing a rickroll.**

## What we're building

DMarcus busts an ASCII dance (the real dmarcheck `creature-dance`/`creature-kick` animation, ASCII-fied à la ASCILINE) on two surfaces:

1. **An app tile** — a new native CortechOS app `dmarcus`. Opening it shows the dancing ASCII DMarcus, a chiptune Play/Stop toggle, and a "Never gonna click this →" button that opens the genuine YouTube video in a new tab.
2. **A desktop idle animation** — after **60 s of inactivity** (mirroring dmarcheck's own 60 s creature easter egg), DMarcus slides onto the desktop and does a silent little dance with a `♪` bubble. Any activity dismisses him; clicking him opens the app.

The look was validated by a spike (Playwright-rendered real DMarcus → in-canvas ASCII): party hat, white googly eyes, `@` body, and three kicking legs all survive at **64 cols**. Not a blob. ✅

## Architecture

### Two-stage split: offline bake vs. static runtime

The hard/heavy work (rendering the CSS creature, running ASCILINE) happens **offline, once**, in authoring scripts. The output is a small committed JSON of ASCII frames. **Runtime is 100% static** — the app and idle overlay just play back baked frames. No Python, no FFmpeg, no WebSocket, no Cloudflare Functions. This preserves the site's static hosting contract (`public/_routes.json` excludes everything).

The pipeline scripts are committed for reproducibility but **never run in CI or at build time** — only by hand when frames need regenerating.

### The offline bake pipeline (`scripts/dmarcus/`)

1. **Render** (`render-frames.mjs`, Playwright) — a standalone HTML page embeds the real DMarcus markup (`generateCreature` structure) + the creature CSS lifted verbatim from dmarcheck `src/views/styles.ts` (the `.creature*` rules, `@keyframes creature-dance`, `@keyframes creature-kick`, accent `#f97316`). The dance is frozen at N points across one 1.2 s loop via paused negative `animation-delay`, and each frame is screenshotted (tight crop, transparent bg).
2. **Stitch** (FFmpeg) — assemble the PNG sequence into a short looping `dmarcus.mp4`.
3. **ASCILINE it** (`asciline-bake`) — **(A, canonical)** clone YusufB5/ASCILINE, `pip install` its deps, import its NumPy pixel→char conversion, run it over `dmarcus.mp4`, and dump frame data to JSON. **(B, fallback)** if ASCILINE's deps won't install on Python 3.13 or a reproducible in-repo rebuild is wanted later, reimplement the same luminance/coverage→ramp + per-cell color in ~40 lines of Node over the captured frames. Both produce the same JSON shape.
4. **Bake** — write `src/lib/dmarcus/dance-frames.json`.

**ASCILINE licensing:** verify its LICENSE before running. We only _run_ it as an external tool — we do **not** vendor its source into this repo — and credit YusufB5 in `scripts/dmarcus/README.md`. If the license disallows even that, use fallback (B).

### Baked asset (`src/lib/dmarcus/dance-frames.json`)

```jsonc
{
  "meta": { "frames": 16, "loopMs": 1200, "cols": 64, "ramp": " .:-=+*#%@", "source": "ASCILINE" },
  "frames": [{ "w": 64, "h": 40, "text": "…\\n…", "colors": ["rrggbb" | null, …] }]
}
```

- **Resolution:** 64 cols (per decision). Rows derived from aspect (~40).
- **Frames:** ~16 across one loop (smoother than the spike's 12 at this resolution).
- **Size budget:** keep the committed JSON **< 150 KB** (ideally smaller). Levers if over: fewer frames, palette-index the colors (DMarcus is ≈ accent + white eyes + dark pupils — a tiny palette), or drop near-duplicate frames. Document the final size in the script README.

### Runtime modules

| File | Responsibility |
| --- | --- |
| `src/lib/dmarcus/frames.ts` | Typed loader + runtime validation of `dance-frames.json` (frame count, equal `w`/`h`, `colors.length === w*h`, chars within ramp). Pure → unit-tested. |
| `src/lib/dmarcus/chiptune.ts` | Pure note-sequence data (a **short, evocative** melodic hook) + a tiny Web Audio builder returning `{ play, stop }`. `AudioContext` created lazily on user gesture. Note data pure → unit-tested. |
| `src/components/os/apps/DmarcusApp.tsx` | The window. Plays frames to a `<canvas>` (ASCILINE-style, efficient), with chiptune Play/Stop and the YouTube button. Lazy-loaded like other native apps. |
| `src/components/os/useIdleDmarcus.ts` | Idle-timer hook: fires after `IDLE_MS` (60 000) of no pointer/keydown, resets on activity, re-arms with a cooldown, and **never fires under `prefers-reduced-motion`**. Timer logic pure → unit-tested. |
| `src/components/os/IdleDmarcus.tsx` | The idle overlay (small canvas + `♪` bubble), rendered in `OSShell.tsx`. Click → `useOS.getState().openApp('dmarcus')`. |
| `src/apps/registry.ts` | One new `AppManifest` entry (native, `allowMultiple: false`). |

### Registry entry (proposed — name/description tweakable)

```ts
{
  id: 'dmarcus',
  name: 'DMarcus',
  description: 'Your mascot learned a new dance.',
  icon: '🕺', // or the orange "@" rendered inline
  type: 'native',
  component: () => import('../components/os/apps/DmarcusApp'),
  defaultSize: { w: 540, h: 600 },
  allowMultiple: false,
}
```

The launcher, desktop icons, taskbar, and mobile springboard pick this up automatically. The springboard tile-count assertion at `e2e/smoke.spec.ts:266` is `apps.length + featuredRepos.length`, so it **self-updates** — no manual bump.

## Audio & the rickroll payoff

- **Chiptune** — original Web Audio synthesis of a short hook of the melody. No copyrighted recording, no CSP/hosting impact. Plays only on an explicit click (browsers block autoplay-with-sound anyway). A clear Stop/mute.
- **Real payoff** — a "Never gonna click this →" button opens `https://www.youtube.com/watch?v=dQw4w9WgXcQ` in a new tab via `<a target="_blank" rel="noopener noreferrer">` (or `window.open(url, '_blank', 'noopener,noreferrer')`). New-tab navigation needs **no CSP/`_headers` change**.
- **Idle animation is silent by design** — a desktop that randomly sings is annoying, and autoplay is blocked regardless. Audio is opt-in, inside the app, on a real gesture.

## Copyright posture (explicit)

- **No** Rick Astley master recording bundled or streamed.
- **No** bundled full lyrics. (If any lyric text appears at all, it is at most a single iconic line as a wink — default is none.)
- The chiptune is an original synth of a **short** melodic hook. The underlying _composition_ is still copyrighted (Stock/Aitken/Waterman); a brief homage on a personal portfolio is standard meme practice and very low risk. Keep it short/evocative, not a full faithful transcription.
- The "real" rickroll is an **outbound link** to the official video — zero hosting/copyright surface on us.
- ASCILINE: run-as-tool only, not vendored; credited.

## Accessibility (non-negotiable — extends the contract in `docs/architecture.md`)

- **Reduced motion:** under `prefers-reduced-motion: reduce`, the app shows a single static DMarcus pose (no frame animation) and the idle DMarcus **never auto-appears**. JS-driven animation isn't covered by the global CSS rule, so check `window.matchMedia` directly, mirroring `BootSplash.tsx:44`.
- The ASCII `<canvas>`/`<pre>` is decorative → `aria-hidden`; its container gets an `aria-label` ("DMarcus the dmarcheck mascot, dancing").
- The idle overlay never traps or steals focus; any keydown/pointer dismisses it.
- Audio never autoplays; always opt-in with an obvious Stop.

## Testing (TDD)

- **Unit (vitest):**
  - `frames.test.ts` — loader/validator: frame count matches `meta.frames`; every frame shares `w`/`h`; `colors.length === w*h`; all chars ∈ ramp ∪ {space}.
  - `chiptune.test.ts` — note data: non-empty; total duration ≈ a sane loop length; all frequencies finite and > 0.
  - `useIdleDmarcus` timer logic — fires after threshold; resets on activity; suppressed when reduced-motion flag set.
- **E2E (playwright, `e2e/smoke.spec.ts`):** open DMarcus from the launcher → assert the canvas/container renders and the YouTube button has `href="…dQw4w9WgXcQ"`, `target="_blank"`, `rel` containing `noopener`. Mobile springboard count auto-updates.
- **Manual preview verification** before PR: screenshot the app window dancing; confirm no console errors; confirm reduced-motion path is static.
- **Gates:** `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build` all green before PR (per CLAUDE.md). PR only; no push to main.

## Scope cuts (YAGNI)

- The generic webcam/image/video "ASCII Cam" is **dropped** — DMarcus-as-ASCII is the feature.
- No mood/grade system (that's dmarcheck's job).
- Idle animation is **desktop-only**; mobile gets the app tile only.
- Chiptune is a short hook, not the full song.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| ASCILINE deps (OpenCV) won't install on Python 3.13 | Fallback (B): Node reimplementation of the conversion. Same JSON output. |
| Baked JSON too large | Frame trim, palette-index colors, drop near-duplicate frames; budget < 150 KB. |
| Audio autoplay blocked / annoying | Opt-in only, on user gesture; idle is silent. |
| Idle dance annoys repeat visitors | 60 s threshold, dismiss-on-activity, re-arm cooldown, never under reduced-motion. |
| ASCILINE license | Run-as-tool only, not vendored; credit; fallback (B) if needed. |

## Open items for owner sign-off

1. **App name + tile description** — proposed `DMarcus` / "Your mascot learned a new dance." Keep the description lyric-free (the one spot to stay clean).
2. **Idle insistence** — silent + dismissable as specced, or a touch more theatrical (longer shuffle path, bigger bubble)?
