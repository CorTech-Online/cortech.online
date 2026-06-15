import { test, expect, devices, type ConsoleMessage, type Page } from '@playwright/test';
import { apps } from '../src/apps/registry';

// donthype-me is temporarily excluded — upstream regressed X-Frame-Options: deny.
// Tracking: https://github.com/schmug/donthype-me/issues/905 — re-add when resolved.
const IFRAME_APPS = [
  { id: 'dmarc-mx', name: 'dmarc.mx', url: 'https://dmarc.mx' },
  { id: 'apartment-stager', name: 'apartment-stager', url: 'https://apartment-stager.pages.dev/' },
  { id: 'qr-me', name: 'q-r.contact', url: 'https://q-r.contact' },
] as const;

// Dev-mode noise we accept. Anything else fails the assertion.
const CONSOLE_NOISE = [
  /\[vite\]/i,
  /\[HMR\]/i,
  /Download the React DevTools/i,
  /favicon\.svg/i,
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
];

type CapturedMessage = { type: string; text: string };

function captureConsole(page: Page): CapturedMessage[] {
  const captured: CapturedMessage[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      captured.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    captured.push({ type: 'pageerror', text: err.message });
  });
  return captured;
}

function filterNoise(messages: CapturedMessage[]): CapturedMessage[] {
  return messages.filter((m) => !CONSOLE_NOISE.some((re) => re.test(m.text)));
}

async function dismissBootSplash(page: Page) {
  const splash = page.locator('[aria-label="CortechOS booting"]');
  // Wait for splash to mount so the keydown listener is actually attached.
  await splash.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  await page.keyboard.press('Space');
  await splash.waitFor({ state: 'hidden', timeout: 10_000 });
}

async function bootDesktop(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissBootSplash(page);
  await expect(page.locator('#ct-desktop')).toBeVisible({ timeout: 15_000 });
}

async function openApp(page: Page, appName: string) {
  await page.locator('button[aria-label="Open launcher"]').click();
  const launcher = page.locator('[role="dialog"][aria-label="App launcher"]');
  await expect(launcher).toBeVisible();
  await page.locator('input[aria-label="Search apps"]').fill(appName);
  await page.keyboard.press('Enter');
  await expect(launcher).toBeHidden();
  await expect(page.locator(`section[aria-label="${appName} window"]`)).toBeVisible();
}

// Block external font CDN — otherwise page.goto and page.screenshot hang on
// `document.fonts.ready`. Fulfill (vs abort) keeps the console clean.
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
});

test.describe('desktop golden path', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('boots, opens windows via icon and launcher, ⌘K toggles, Esc closes', async ({
    page,
  }, testInfo) => {
    const messages = captureConsole(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissBootSplash(page);

    // Generous timeout for first-run Vite lazy-chunk compilation.
    await expect(page.locator('#ct-desktop')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: testInfo.outputPath('1-booted.png') });

    // About auto-opens on first boot; clicking the icon focuses the singleton.
    await page.locator('button[aria-label="Open About Schmug"]').click();
    await expect(page.locator('section[aria-label="About Schmug window"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('2-about-open.png') });

    // Brand-mark regression: AboutApp header renders the full mark as an <img>, not an emoji.
    const aboutAvatar = page.locator(
      'section[aria-label="About Schmug window"] img[src="/mark.svg"]',
    );
    await expect(aboutAvatar).toBeVisible();

    await page.locator('button[aria-label="Open launcher"]').click();
    const launcher = page.locator('[role="dialog"][aria-label="App launcher"]');
    await expect(launcher).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('3-launcher-open.png') });

    await page.locator('input[aria-label="Search apps"]').fill('proj');
    await page.keyboard.press('Enter');
    await expect(page.locator('section[aria-label="Projects window"]')).toBeVisible();
    await expect(launcher).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('4-projects-open.png') });

    // ⌘K toggles launcher (useKeyboard accepts metaKey || ctrlKey)
    await page.keyboard.press('Meta+K');
    await expect(launcher).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(launcher).toBeHidden();

    const realErrors = filterNoise(messages);
    expect(
      realErrors,
      `Unexpected console output:\n${realErrors.map((m) => `  [${m.type}] ${m.text}`).join('\n')}`,
    ).toEqual([]);
  });
});

test.describe('desktop interactions', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('⌘W closes the focused window', async ({ page }) => {
    await bootDesktop(page);
    await openApp(page, 'Projects');
    const win = page.locator('section[aria-label="Projects window"]');
    await expect(win).toBeVisible();

    // Focus is set on the window's <section> by Window.tsx when opened; ⌘W is global.
    await page.keyboard.press('Meta+W');
    await expect(win).toHaveCount(0);
  });

  test('Minimize hides the window; clicking the taskbar pill restores it', async ({ page }) => {
    await bootDesktop(page);
    await openApp(page, 'Projects');
    const win = page.locator('section[aria-label="Projects window"]');
    await expect(win).toBeVisible();

    await page.locator('button[aria-label="Minimize Projects"]').click();
    // Window.tsx returns null when minimized, so the <section> is unmounted.
    await expect(win).toHaveCount(0);

    // Taskbar pill for Projects is now in "min" state; clicking restores it.
    const pill = page.locator('[role="tab"]', { hasText: 'Projects' });
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(win).toBeVisible();
  });

  test('Maximize → Restore round-trip returns the window to its pre-max rect', async ({ page }) => {
    await bootDesktop(page);
    await openApp(page, 'About Schmug');
    const win = page.locator('section[aria-label="About Schmug window"]');
    const preMax = await win.boundingBox();
    expect(preMax).toBeTruthy();

    await page.locator('button[aria-label="Maximize About Schmug"]').click();
    const maxed = await win.boundingBox();
    expect(maxed!.width).toBeGreaterThan(preMax!.width);
    expect(maxed!.height).toBeGreaterThan(preMax!.height);

    // After toggle, the button label flips to "Restore".
    await page.locator('button[aria-label="Restore About Schmug"]').click();
    const restored = await win.boundingBox();
    expect(Math.round(restored!.x)).toBe(Math.round(preMax!.x));
    expect(Math.round(restored!.y)).toBe(Math.round(preMax!.y));
    expect(Math.round(restored!.width)).toBe(Math.round(preMax!.width));
    expect(Math.round(restored!.height)).toBe(Math.round(preMax!.height));
  });

  test('Layout persists across reload (localStorage blob survives)', async ({ page }) => {
    await bootDesktop(page);
    await openApp(page, 'Projects');
    const win = page.locator('section[aria-label="Projects window"]');
    await expect(win).toBeVisible();

    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('cortechos:layout');
      return raw ? JSON.parse(raw).state : null;
    });
    expect(before).toBeTruthy();
    const projBefore = before.windows.find((w: { appId: string }) => w.appId === 'projects');
    expect(projBefore).toBeTruthy();

    await page.reload();
    // sessionStorage survives reload → no splash on reload within a visit.
    await expect(page.locator('#ct-desktop')).toBeVisible({ timeout: 15_000 });
    await expect(win).toBeVisible();

    const after = await page.evaluate(() => {
      const raw = localStorage.getItem('cortechos:layout');
      return raw ? JSON.parse(raw).state : null;
    });
    const projAfter = after.windows.find((w: { appId: string }) => w.appId === 'projects');
    expect(projAfter.x).toBe(projBefore.x);
    expect(projAfter.y).toBe(projBefore.y);
    expect(projAfter.w).toBe(projBefore.w);
    expect(projAfter.h).toBe(projBefore.h);
  });
});

// Strip defaultBrowserType — can't change browser at describe scope, only viewport/UA matter.
const { defaultBrowserType: _ignoredBrowser, ...iPhone14 } = devices['iPhone 14'];

test.describe('mobile springboard', () => {
  test.use(iPhone14);

  test('home grid + dock render, tap opens app fullscreen, back returns home', async ({ page }) => {
    // Stub /api/projects.json with two fake featured repos so tile count is
    // deterministic — the real endpoint hits GitHub and is rate-limit-sensitive.
    const stubFeatured = [
      {
        fullName: 'fake/alpha',
        name: 'alpha',
        description: 'stub',
        htmlUrl: 'https://example.invalid/alpha',
        homepage: null,
        language: null,
        stargazersCount: 0,
        updatedAt: null,
        fork: false,
        archived: false,
        private: false,
      },
      {
        fullName: 'fake/beta',
        name: 'beta',
        description: 'stub',
        htmlUrl: 'https://example.invalid/beta',
        homepage: null,
        language: null,
        stargazersCount: 0,
        updatedAt: null,
        fork: false,
        archived: false,
        private: false,
      },
    ];
    await page.route('**/api/projects.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          repos: [],
          featured: stubFeatured,
          fetchedAt: new Date().toISOString(),
        }),
      }),
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // MobileShell mounts immediately — no boot splash.
    const grid = page.locator('[data-testid="home-grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#ct-desktop')).toHaveCount(0);

    // Tiles = static registry apps + the two stubbed featured repos.
    const tiles = grid.locator('button[aria-label^="Open "]');
    await expect(tiles).toHaveCount(apps.length + stubFeatured.length, { timeout: 10_000 });

    // Dock shows 3 pinned apps (About, Support, Projects).
    const dockButtons = page.locator('nav[aria-label="Dock"] button');
    await expect(dockButtons).toHaveCount(3);
    await expect(
      page.locator('nav[aria-label="Dock"] button[aria-label="Open About Schmug"]'),
    ).toBeVisible();
    await expect(
      page.locator('nav[aria-label="Dock"] button[aria-label="Open Support"]'),
    ).toBeVisible();
    await expect(
      page.locator('nav[aria-label="Dock"] button[aria-label="Open Projects"]'),
    ).toBeVisible();

    // Tap an iframe app (dmarc.mx) → fullscreen app view with iframe + back pill.
    await grid.locator('button[aria-label="Open dmarc.mx"]').tap();
    const appView = page.locator('div[role="dialog"][aria-label="dmarc.mx app"]');
    await expect(appView).toBeVisible();
    await expect(appView.locator('iframe[title="dmarc.mx"]')).toBeVisible();
    const backPill = page.locator('button[aria-label="Back to home"]');
    await expect(backPill).toBeVisible();

    // Tap back → app view gone, home grid visible again.
    await backPill.tap();
    await expect(appView).toHaveCount(0);
    await expect(grid).toBeVisible();
  });

  test('prefers-reduced-motion disables the slide-up transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const grid = page.locator('[data-testid="home-grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });

    await grid.locator('button[aria-label="Open dmarc.mx"]').tap();
    const appView = page.locator('div[role="dialog"][aria-label="dmarc.mx app"]');
    await expect(appView).toBeVisible();

    // Under reduced motion, the slide-up transform is disabled —
    // transition-property should only cover opacity, not transform.
    const transitionProperty = await appView.evaluate(
      (el) => window.getComputedStyle(el).transitionProperty,
    );
    expect(transitionProperty).toBe('opacity');
  });
});

test.describe('iframe embed', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // External services (dmarc.mx, qr-me, apartment-stager) lock their CSP
  // frame-ancestors to https://cortech.online, which blocks the localhost
  // origin this suite runs against in CI. Keep the test for local runs —
  // it still catches regressions when exercised against the prod origin.
  test.skip(!!process.env.CI, 'External CSPs require prod cortech.online origin');

  test('all iframe apps embed without CSP/XFO refusal', async ({ page }) => {
    const messages = captureConsole(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissBootSplash(page);
    await expect(page.locator('#ct-desktop')).toBeVisible({ timeout: 15_000 });

    for (const app of IFRAME_APPS) {
      await page.locator('button[aria-label="Open launcher"]').click();
      const launcher = page.locator('[role="dialog"][aria-label="App launcher"]');
      await expect(launcher).toBeVisible();
      await page.locator('input[aria-label="Search apps"]').fill(app.name);
      await page.keyboard.press('Enter');
      await expect(launcher).toBeHidden();

      const iframe = page.locator(`iframe[title="${app.name}"]`);
      await expect(iframe).toBeAttached({ timeout: 8_000 });
      await expect(iframe).toHaveAttribute('src', app.url);

      // Close the window before the next iteration so the iframe count stays stable.
      await page.locator(`button[aria-label="Close ${app.name}"]`).click();
      await expect(page.locator(`section[aria-label="${app.name} window"]`)).toHaveCount(0);
    }

    const xfoNoise = messages.filter((m) =>
      /Refused to display.*frame|X-Frame-Options|Content Security Policy/i.test(m.text),
    );
    expect(
      xfoNoise,
      `Iframe embedding blocked:\n${xfoNoise.map((m) => `  [${m.type}] ${m.text}`).join('\n')}`,
    ).toEqual([]);
  });
});

test.describe('DMarcus rickroll app', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('opens and exposes a safe outbound rickroll link + canvas', async ({ page }) => {
    const messages = captureConsole(page);
    await bootDesktop(page);
    await openApp(page, 'DMarcus');

    const win = page.locator('section[aria-label="DMarcus window"]');
    await expect(win.locator('canvas')).toBeVisible();

    const link = win.locator('a[href*="dQw4w9WgXcQ"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);

    expect(filterNoise(messages)).toEqual([]);
  });
});
