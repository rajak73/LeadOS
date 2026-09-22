import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, THEME_STORAGE_KEY } from '@/providers/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeToggle } from './theme-toggle';

function renderToggle() {
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <ThemeToggle />
      </TooltipProvider>
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('switches to dark, persists the choice and back to light', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('button', { name: /theme: system/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: /dark/i }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('button', { name: /theme: dark/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: /light/i }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restores the saved preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderToggle();
    expect(screen.getByRole('button', { name: /theme: dark/i })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('works when storage is unavailable', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      renderToggle();
      expect(screen.getByRole('button', { name: /theme: system/i })).toBeInTheDocument();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
