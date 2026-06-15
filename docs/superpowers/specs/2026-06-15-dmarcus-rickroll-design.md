# DMarcus's Big Number — an ASCILINE rickroll easter egg

**Date:** 2026-06-15
**Status:** Approved (design); spike validated the look at 64 cols. Bake is **cleanroom Node-only** (no Python, no new deps).
**Spike artifacts (to be removed when this ships):** `scripts/dmarcus/spike.mjs`, `src/spike/dmarcus-frames.json`, `src/pages/dmarcus-spike.astro`.

## Problem / motivation

A "just for fun" addition to [cortech.online](https://cortech.online), sparked by [YusufB5/ASCILINE](https://github.com/YusufB5/ASCILINE) (a real-time video→ASCII renderer). ASCILINE itself is a server-side Python app (FastAPI + OpenCV + FFmpeg) and can't run on this static, Functions-disabled Cloudflare Pages site. But its _technique_ — luminance → character-ramp conversion — is a standard idea we can reimplement cleanly, and it pairs perfectly with **DMarcus**, the dmarcheck mascot, who is literally an orange `@` character with googly eyes and three legs. So the easter egg is: **DMarcus, rendered as ASCII art, dancing a rickroll.**

## What we're building

DMarcus appears on two surfaces:

1. **An app tile** — a new native CortechOS app `dmarcus`. Opening it shows the dancing ASCII DMarcus (the real dmarcheck `creature-dance`/`creature-kick` animation, ASCII-fied), a chiptune Play/Stop toggle, and a "Never gonna click this →" button that opens the genuine YouTube video in a new tab.
2. **A desktop idle animation** — after **60 s of inactivity** (mirroring dmarcheck's own 60 s creature easter egg), DMarcus quietly appears on the desktop. He is **silent, does not dance, and blinks every few seconds** — a calm ambient presence, not a thing dancing in your corner forever. Any activity dismisses him; clicking him opens the app (where he actually dances + rickrolls).

The look was validated by a spike (Playwright-rendered real DMarcus → in-canvas ASCII): party hat, white googly eyes, `@` body, and three kicking legs all survive at **64 cols**. Not a blob. ✅

## Architecture

### Two-stage split: offline bake vs. static runtime

The work of rendering the CSS creature and ASCII-fying it happens **offline, once**, in an authoring script. The output is a small committed JSON of ASCII frames. **Runtime is 100% static** — the app and idle overlay just play back baked frames. No Python, no FFmpeg, no WebSocket, no Cloudflare Functions. This preserves the site's static hosting contract (`public/_routes.json` excludes everything).

The pipeline script is committed for reproducibility but **never runs in CI or at build time** — only by hand when frames need regenerating.

### The offline bake pipeline (`scripts/dmarcus/render-frames.mjs`)

**Cleanroom, Node-only, zero new deps.** This is a Node/Astro repo, not Python — so the bake does **not** clone or run ASCILINE, add Python/OpenCV/FFmpeg, or copy any ASCILINE source. We reimplement the _standard, well-known_ luminance/coverage → character-ramp technique ourselves (a few dozen lines), crediting ASCILINE as the inspiration. The only tool used is **Playwright, already a devDependency** (e2e). There is **no mp4/FFmpeg stage** — conversion happens in-canvas during capture, exactly as the validated spike did.

1. **Render** (Playwright) — a standalone HTML page embeds the real DMarcus markup (`generateCreature` structure) + the creature CSS lifted verbatim from dmarcheck `src/views/styles.ts` (the `.creature*` rules, `@keyframes creature-dance`, `@keyframes creature-kick`, accent `#f97316`), plus an added **eyes-closed blink state** used for the idle frames.
2. **Capture + convert** — for each sampled point across the dance loop (and for the idle open/blink poses), freeze the animation via paused negative `animation-delay`, screenshot (tight crop, transparent bg), then ASCII-fy in an `OffscreenCanvas`: downsample to 64 cols → map coverage/luminance to the char ramp → record per-cell color. (Our own implementation of the ASCILINE technique.)
3. **Bake** — write `src/lib/dmarcus/dance-frames.json` (a `dance` group + an `idle` group).

### Baked asset (`src/lib/dmarcus/dance-frames.json`)

```jsonc
{
  "meta": {
    "loopMs": 1200,
    "cols": 64,
    "ramp": " .:-=+*#%@",
    "credit": "ASCII technique inspired by github.com/YusufB5/ASCILINE",
  },
  "dance": [{ "w": 64, "h": 40, "text": "…\\n…", "colors": ["rrggbb" | null, …] }],
  "idle": {
    "open": { "w": 64, "h": 40, "text": "…", "colors": [/* … */] },
    "blink": { "w": 64, "h": 40, "text": "…", "colors": [/* … */] },
  },
}
```

- **Resolution:** 64 cols (per decision). Rows derived from aspect (~40).
- **`dance`:** ~16 frames across one loop (smoother than the spike's 12 at this resolution).
- **`idle`:** two poses — `open` (resting) and `blink` (eyes closed). The overlay shows `open` and swaps to `blink` for ~120 ms at a random 3–6 s cadence.
- **Size budget:** keep the committed JSON **< 150 KB** (ideally smaller). Levers if over: fewer dance frames, palette-index the colors (DMarcus is ≈ accent + white eyes + dark pupils — a tiny palette), or drop near-duplicate frames. Document the final size in the script README.

### Runtime modules

| File                                    | Responsibility                                                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/dmarcus/frames.ts`             | Typed loader + runtime validation of `dance-frames.json` (dance frame count; every frame shares `w`/`h`; `colors.length === w*h`; chars within ramp; idle has `open` + `blink`). Pure → unit-tested.                          |
| `src/lib/dmarcus/chiptune.ts`           | Pure note-sequence data (a **short, evocative** melodic hook) + a tiny Web Audio builder returning `{ play, stop }`. `AudioContext` created lazily on user gesture. Note data pure → unit-tested.                             |
| `src/components/os/apps/DmarcusApp.tsx` | The window. Plays the `dance` frames to a `<canvas>` (ASCILINE-style, efficient), with chiptune Play/Stop and the YouTube button. Lazy-loaded like other native apps.                                                         |
| `src/components/os/useIdleDmarcus.ts`   | Idle-timer hook: fires after `IDLE_MS` (60 000) of no pointer/keydown, resets on activity, re-arms with a cooldown, and **never fires under `prefers-reduced-motion`**. Timer logic pure → unit-tested.                       |
| `src/components/os/IdleDmarcus.tsx`     | The idle overlay (small canvas), rendered in `OSShell.tsx`. Shows the resting pose and **blinks** (open→blink→open) at a random 3–6 s cadence. Click → `useOS.getState().openApp('dmarcus')`. Does not dance, makes no sound. |
| `src/apps/registry.ts`                  | One new `AppManifest` entry (native, `allowMultiple: false`).                                                                                                                                                                 |

### Registry entry (approved)

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
- **Idle is silent by design** — no audio, ever, on the desktop idle surface. Audio is opt-in, inside the app, on a real gesture.

## Copyright posture (explicit)

- **No** Rick Astley master recording bundled or streamed.
- **No** bundled full lyrics. (Default: none. At most a single iconic line as a wink, if any.)
- The chiptune is an original synth of a **short** melodic hook. The underlying _composition_ is still copyrighted (Stock/Aitken/Waterman); a brief homage on a personal portfolio is standard meme practice and very low risk. Keep it short/evocative, not a full transcription.
- The "real" rickroll is an **outbound link** to the official video — zero hosting/copyright surface on us.
- **ASCILINE:** cleanroom reimplementation of a standard technique — no source copied, no code vendored, no deps added. Credited as inspiration in `scripts/dmarcus/README.md` and `meta.credit`.

## Accessibility (non-negotiable — extends the contract in `docs/architecture.md`)

- **Reduced motion:** under `prefers-reduced-motion: reduce`, the app shows a single static DMarcus pose (no frame animation, no blink) and the idle DMarcus **never auto-appears**. JS-driven animation isn't covered by the global CSS rule, so check `window.matchMedia` directly, mirroring `BootSplash.tsx:44`.
- The ASCII `<canvas>` is decorative → `aria-hidden`; its container gets an `aria-label` ("DMarcus the dmarcheck mascot, dancing").
- The idle overlay never traps or steals focus; any keydown/pointer dismisses it.
- Audio never autoplays; always opt-in with an obvious Stop.

## Testing (TDD)

- **Unit (vitest):**
  - `frames.test.ts` — loader/validator: dance frame count matches; every frame shares `w`/`h`; `colors.length === w*h`; all chars ∈ ramp ∪ {space}; `idle` has both `open` and `blink`.
  - `chiptune.test.ts` — note data: non-empty; total duration ≈ a sane loop length; all frequencies finite and > 0.
  - `useIdleDmarcus` timer logic — fires after threshold; resets on activity; suppressed when reduced-motion flag set.
- **E2E (playwright, `e2e/smoke.spec.ts`):** open DMarcus from the launcher → assert the canvas/container renders and the YouTube button has `href="…dQw4w9WgXcQ"`, `target="_blank"`, `rel` containing `noopener`. Mobile springboard count auto-updates.
- **Manual preview verification** before PR: screenshot the app window dancing and the idle DMarcus blinking; confirm no console errors; confirm the reduced-motion path is static and idle never appears.
- **Gates:** `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build` all green before PR (per CLAUDE.md). PR only; no push to main.

## Scope cuts (YAGNI)

- The generic webcam/image/video "ASCII Cam" is **dropped** — DMarcus-as-ASCII is the feature.
- No mood/grade system (that's dmarcheck's job).
- The full dance + chiptune + rickroll button live **only in the app**. The desktop idle surface is **stand + blink, silent**, desktop-only — mobile gets the app tile only.
- Chiptune is a short hook, not the full song.

## Risks & mitigations

| Risk                              | Mitigation                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Baked JSON too large              | Frame trim, palette-index colors, drop near-duplicate frames; budget < 150 KB.                                             |
| Audio autoplay blocked / annoying | Opt-in only, on user gesture; idle is silent.                                                                              |
| Idle dance annoys repeat visitors | Idle doesn't dance (stand + blink only); 60 s threshold; dismiss-on-activity; re-arm cooldown; never under reduced-motion. |

## Resolved sign-offs

1. **App name + tile description** — ✅ `DMarcus` / "Your mascot learned a new dance." (kept lyric-free).
2. **Idle behavior** — ✅ silent, dismissable, **stand + occasional blink** (no dance).
3. **Bake approach** — ✅ cleanroom Node-only, no Python, no new deps, no copied source.
