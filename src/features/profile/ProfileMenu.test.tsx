import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '@/lib/editor';
import { buildProfile } from '@/lib/profile';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { ProfileMenu } from './ProfileMenu';

const renderMenu = (overrides: Partial<Parameters<typeof ProfileMenu>[0]> = {}) =>
  render(<ProfileMenu disabled={false} onExport={vi.fn()} onImport={vi.fn()} {...overrides} />);

const validProfile = buildProfile(createInitialState(), DEFAULT_SETTINGS, new Date('2026-11-04'));

const upload = async (text: string) => {
  const file = new File([text], 'ak820-profile.json', { type: 'application/json' });
  await userEvent.upload(screen.getByLabelText('Choose a profile file'), file);
};

describe('ProfileMenu', () => {
  it('exports from the menu', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    renderMenu({ onExport });

    await user.click(screen.getByRole('button', { name: 'Profile' }));
    await user.click(await screen.findByRole('button', { name: /export profile/i }));

    expect(onExport).toHaveBeenCalled();
  });

  it('asks before replacing the drafts', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    renderMenu({ onImport });

    await user.click(screen.getByRole('button', { name: 'Profile' }));
    await upload(validProfile);

    expect(await screen.findByText(/nothing is sent until you upload/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /replace drafts/i }));

    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({ clockMode: DEFAULT_SETTINGS.clock.mode }),
    );
  });

  it('lists what is wrong with a broken file and offers no replace', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    renderMenu({ onImport });

    await user.click(screen.getByRole('button', { name: 'Profile' }));
    await upload('{ not json');

    expect(await screen.findByText('The file is not JSON.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replace drafts/i })).not.toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
  });
});
