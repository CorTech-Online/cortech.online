# DMarcus bake

`render-frames.mjs` regenerates `src/lib/dmarcus/dance-frames.json` — the ASCII
dance + idle frames for the DMarcus easter-egg app and the desktop idle overlay.

- Cleanroom + Node-only: uses Playwright (already a devDependency). No Python,
  no FFmpeg, no extra deps.
- The ASCII conversion (luminance/coverage → char ramp) is our own implementation
  of a standard technique, **inspired by** [YusufB5/ASCILINE](https://github.com/YusufB5/ASCILINE).
  No ASCILINE source is copied or vendored.
- The creature markup/CSS mirrors dmarcheck's `generateCreature` + `src/views/styles.ts`.
- Colors are stored sparsely (only cells that deviate from the accent orange) to
  keep the baked JSON small (~54 KB).

Run: `node scripts/dmarcus/render-frames.mjs` (then commit the regenerated JSON).
