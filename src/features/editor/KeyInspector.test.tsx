import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createInitialState, editorReducer, getSelectedRow } from '@/lib/editor';
import { KeyInspector } from './KeyInspector';

const chooseUsage = async (
  user: ReturnType<typeof userEvent.setup>,
  search: string,
  option: string,
) => {
  await user.click(screen.getByLabelText('Sends'));
  await user.type(screen.getByLabelText('Search a key or usage'), search);
  await user.click(await screen.findByRole('option', { name: option }));
};

const selectedTop = () => {
  const state = editorReducer(createInitialState(), { type: 'select', idx: 55 });
  return getSelectedRow(state)!;
};

const selectedFn = () => {
  let state = editorReducer(createInitialState(), { type: 'layer', layer: 'fn' });
  state = editorReducer(state, { type: 'select', idx: 1 });
  return getSelectedRow(state)!;
};

describe('KeyInspector', () => {
  it('shows the selected key and its usage', () => {
    const onUsage = vi.fn();
    render(
      <KeyInspector
        row={selectedTop()}
        layer="top"
        locked={false}
        disabled={false}
        onUsage={onUsage}
        onReset={vi.fn()}
        onInvalid={vi.fn()}
      />,
    );

    expect(screen.getByText('CapsLock')).toBeInTheDocument();
    expect(screen.getByLabelText('Sends')).toHaveTextContent('CapsLock (0x39)');
    expect(screen.getByLabelText('Raw usage')).toHaveValue('0x39');
  });

  it('selects a media usage from the picker', async () => {
    const user = userEvent.setup();
    const onUsage = vi.fn();
    render(
      <KeyInspector
        row={selectedTop()}
        layer="top"
        locked={false}
        disabled={false}
        onUsage={onUsage}
        onReset={vi.fn()}
        onInvalid={vi.fn()}
      />,
    );

    await chooseUsage(user, 'mute', 'Media: Mute (c:0xE2)');
    expect(onUsage).toHaveBeenCalledWith(0xe2, true);
  });

  it('parses a raw media usage on blur', async () => {
    const user = userEvent.setup();
    const onUsage = vi.fn();
    render(
      <KeyInspector
        row={selectedTop()}
        layer="top"
        locked={false}
        disabled={false}
        onUsage={onUsage}
        onReset={vi.fn()}
        onInvalid={vi.fn()}
      />,
    );

    const raw = screen.getByLabelText('Raw usage');
    await user.clear(raw);
    await user.type(raw, 'c:0xE9');
    await user.tab();

    expect(onUsage).toHaveBeenCalledWith(0xe9, true);
  });

  it('selects the token when the raw field takes focus', async () => {
    const user = userEvent.setup();
    render(
      <KeyInspector
        row={selectedTop()}
        layer="top"
        locked={false}
        disabled={false}
        onUsage={vi.fn()}
        onReset={vi.fn()}
        onInvalid={vi.fn()}
      />,
    );

    const raw = screen.getByLabelText<HTMLInputElement>('Raw usage');
    await user.click(raw);

    expect(raw).toHaveFocus();
    expect(raw.selectionStart).toBe(0);
    expect(raw.selectionEnd).toBe('0x39'.length);
  });

  it('reports malformed raw input and restores the current token', async () => {
    const user = userEvent.setup();
    const onInvalid = vi.fn();
    render(
      <KeyInspector
        row={selectedTop()}
        layer="top"
        locked={false}
        disabled={false}
        onUsage={vi.fn()}
        onReset={vi.fn()}
        onInvalid={onInvalid}
      />,
    );

    const raw = screen.getByLabelText('Raw usage');
    await user.clear(raw);
    await user.type(raw, 'not-a-usage');
    await user.tab();

    expect(onInvalid).toHaveBeenCalled();
    expect(screen.getByLabelText('Raw usage')).toHaveValue('0x39');
  });

  it('resets the selected key', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <KeyInspector
        row={selectedTop()}
        layer="top"
        locked={false}
        disabled={false}
        onUsage={vi.fn()}
        onReset={onReset}
        onInvalid={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /reset this key/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it('disables the controls for a locked Fn key', () => {
    render(
      <KeyInspector
        row={selectedFn()}
        layer="fn"
        locked
        disabled={false}
        onUsage={vi.fn()}
        onReset={vi.fn()}
        onInvalid={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Sends')).toBeDisabled();
    expect(screen.getByLabelText('Raw usage')).toBeDisabled();
    expect(screen.getByRole('button', { name: /back to firmware default/i })).toBeDisabled();
    expect(screen.getByText('Firmware-owned')).toBeInTheDocument();
  });

  it('shows an empty state when no key is selected', () => {
    render(
      <KeyInspector
        row={null}
        layer="top"
        locked={false}
        disabled={false}
        onUsage={vi.fn()}
        onReset={vi.fn()}
        onInvalid={vi.fn()}
      />,
    );

    expect(screen.getByText('No key selected')).toBeInTheDocument();
  });
});
