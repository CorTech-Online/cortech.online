import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Launcher, matches } from './Launcher';
import { apps, type AppManifest } from '../../apps/registry';
import { useOS } from './store';

function makeApp(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: 'test-app',
    name: 'Test App',
    description: 'a test',
    icon: 'i',
    type: 'native',
    component: () => Promise.resolve({ default: () => null as any }),
    defaultSize: { w: 400, h: 300 },
    ...overrides,
  };
}

beforeEach(() => {
  useOS.setState({ windows: [], focusedId: null, nextZ: 1, hasBooted: false });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('matches (search predicate)', () => {
  it('empty query matches every app', () => {
    expect(matches(makeApp({ id: 'foo', name: 'Foo', description: 'bar' }), '')).toBe(true);
  });

  it('matches on name, description, and id (case-insensitive)', () => {
    const app = makeApp({ id: 'dmarc-mx', name: 'dmarc.mx', description: 'email security' });
    expect(matches(app, 'dmarc')).toBe(true);
    expect(matches(app, 'DMARC')).toBe(true);
    expect(matches(app, 'email')).toBe(true);
    expect(matches(app, 'mx')).toBe(true);
  });

  it('non-matching query returns false', () => {
    const app = makeApp({ id: 'foo', name: 'Foo', description: 'bar' });
    expect(matches(app, 'nope')).toBe(false);
  });
});

describe('<Launcher />', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<Launcher open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders every registered app when the query is empty', () => {
    render(<Launcher open={true} onClose={() => {}} />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(apps.length);
  });

  it('filters the list as the user types', async () => {
    const user = userEvent.setup();
    render(<Launcher open={true} onClose={() => {}} />);
    const input = screen.getByRole('textbox', { name: /search apps/i });
    // "donthype" is unique; "dmarc" now also matches the DMarcus easter-egg app.
    await user.type(input, 'donthype');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toMatch(/donthype\.me/i);
  });

  it('ArrowDown / ArrowUp moves aria-selected across results', async () => {
    const user = userEvent.setup();
    render(<Launcher open={true} onClose={() => {}} />);
    const options = screen.getAllByRole('option');
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');

    await user.keyboard('{ArrowDown}');
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
    expect(options[0]!.getAttribute('aria-selected')).toBe('false');

    await user.keyboard('{ArrowUp}');
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowUp at the top and ArrowDown past the bottom clamp (no wrap)', async () => {
    const user = userEvent.setup();
    render(<Launcher open={true} onClose={() => {}} />);
    const options = screen.getAllByRole('option');

    await user.keyboard('{ArrowUp}');
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');

    for (let i = 0; i < options.length; i++) await user.keyboard('{ArrowDown}');
    const last = options[options.length - 1]!;
    expect(last.getAttribute('aria-selected')).toBe('true');

    await user.keyboard('{ArrowDown}');
    expect(last.getAttribute('aria-selected')).toBe('true');
  });

  it('Enter opens the selected app via the store and calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const openAppSpy = vi.spyOn(useOS.getState(), 'openApp');

    render(<Launcher open={true} onClose={onClose} />);
    await user.keyboard('{Enter}');

    expect(openAppSpy).toHaveBeenCalledTimes(1);
    expect(openAppSpy.mock.calls[0]![0]!.id).toBe(apps[0]!.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Clicking an option opens it and closes the launcher', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<Launcher open={true} onClose={onClose} />);
    const options = screen.getAllByRole('option');
    await user.click(options[2]!);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useOS.getState().windows).toHaveLength(1);
    expect(useOS.getState().windows[0]!.appId).toBe(apps[2]!.id);
  });

  it('Escape closes the launcher', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<Launcher open={true} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab keeps focus on the search input (focus trap)', async () => {
    const user = userEvent.setup();

    render(<Launcher open={true} onClose={() => {}} />);
    const input = screen.getByRole('textbox', { name: /search apps/i }) as HTMLInputElement;
    // requestAnimationFrame focus is racy under happy-dom — force-focus for determinism.
    input.focus();
    expect(document.activeElement).toBe(input);

    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(input);
  });

  it('backdrop click closes the launcher', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<Launcher open={true} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: /app launcher/i });
    await user.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking an inner <li> (not the button) does not bubble up to backdrop close', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<Launcher open={true} onClose={onClose} />);
    const listbox = screen.getByRole('listbox');
    const firstLi = within(listbox).getAllByRole('option')[0]!.parentElement!; // the <li>
    await user.click(firstLi);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders an empty-state message when no apps match the query', async () => {
    const user = userEvent.setup();
    render(<Launcher open={true} onClose={() => {}} />);
    const input = screen.getByRole('textbox', { name: /search apps/i });
    await user.type(input, 'zzzz-nothing-matches-zzzz');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/no apps match/i)).not.toBeNull();
  });
});
