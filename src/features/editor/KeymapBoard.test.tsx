import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '@/lib/editor';
import type { EditorRow } from '@/lib/editor';
import { FN_LOCKED } from '@/lib/keymap';
import { KeymapBoard } from './KeymapBoard';

const renderBoard = (layer: 'top' | 'fn' = 'top', selected: number | null = null) => {
  const state = createInitialState();
  const rows = layer === 'fn' ? state.fn : state.top;
  const onSelect = vi.fn();
  render(
    <KeymapBoard
      rows={rows}
      layer={layer}
      selected={selected}
      disabled={false}
      onSelect={onSelect}
    />,
  );
  return { onSelect, board: screen.getByRole('group', { name: /keyboard board/i }) };
};

const withUsage = (idx: number, usage: number, media = false) =>
  createInitialState().top.map((row) => (row.idx === idx ? { ...row, usage, media } : row));

const renderRows = (rows: readonly EditorRow[]) => {
  render(
    <KeymapBoard rows={rows} layer="top" selected={null} disabled={false} onSelect={vi.fn()} />,
  );
  return screen.getByRole('group', { name: /keyboard board/i });
};

/**
 * jsdom lays nothing out, so the board's own measurement is faked here: a 4 px
 * advance per character inside a 26 px cap whose content box is 22 px. The
 * board measures the cap, not the text, so the two numbers are enough.
 */
const stubLegendLayout = () => {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(26);
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    const text = this.textContent ?? '';
    return 26 + Math.max(0, Math.round(text.length * 4) - 22);
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KeymapBoard', () => {
  it('renders all 81 keys and selects one', async () => {
    const user = userEvent.setup();
    const { board, onSelect } = renderBoard('top', 55);

    expect(within(board).getAllByRole('button')).toHaveLength(81);
    expect(within(board).getByRole('button', { name: 'CapsLock' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(board).getByRole('button', { name: 'A' }));
    expect(onSelect).toHaveBeenCalledWith(56);
  });

  it('locks the six fnlayer_disable keys on the Fn layer', () => {
    const { board } = renderBoard('fn');

    const buttons = within(board).getAllByRole('button');
    expect(buttons).toHaveLength(81);
    expect(buttons.filter((button) => button.hasAttribute('disabled'))).toHaveLength(6);
    expect(within(board).getByRole('button', { name: 'Esc' })).toBeDisabled();
  });

  it('disables every key while a transfer runs', () => {
    const state = createInitialState();
    render(
      <KeymapBoard rows={state.top} layer="top" selected={null} disabled onSelect={vi.fn()} />,
    );

    const board = screen.getByRole('group', { name: /keyboard board/i });
    expect(
      within(board)
        .getAllByRole('button')
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true);
  });

  it('reads out the layer, key count and legend', () => {
    renderBoard('fn');

    expect(screen.getByText('Fn layer, 81 keys')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText('Pending upload')).toBeInTheDocument();
    expect(screen.getByText(`Firmware-owned: ${FN_LOCKED.size}`)).toBeInTheDocument();
  });

  it('keeps the untouched Fn key free of change markers', () => {
    const { board } = renderBoard('top');
    const fn = within(board).getByRole('button', { name: 'Fn' });

    expect(fn).not.toHaveAttribute('data-changed');
    expect(fn).not.toHaveAttribute('data-pending');
  });

  it('keeps the factory legends on a board nothing changed', () => {
    const { board } = renderBoard('top');

    expect(within(board).getByRole('button', { name: 'CapsLock' })).toHaveTextContent('Caps');
    expect(within(board).getByRole('button', { name: 'Shift_L' })).toHaveTextContent('Shift');
    expect(within(board).getByRole('button', { name: '←' })).toHaveTextContent('←');
  });

  it('shows the usage on a key that differs from factory', () => {
    const board = renderRows(withUsage(55, 0x04));
    const cap = within(board).getByRole('button', { name: 'CapsLock' });

    expect(cap).toHaveTextContent('A');
    expect(cap).toHaveAttribute('data-changed', 'true');
  });

  it('labels a media remap with the record it will carry', () => {
    const board = renderRows(withUsage(55, 0xcd, true));
    const cap = within(board).getByRole('button', { name: 'CapsLock' });

    expect(cap).toHaveTextContent('Media: Play/Pause');
    expect(cap).toHaveAttribute('data-changed', 'true');
  });

  it('scrolls the legend the cap cuts and leaves a legend that fits alone', () => {
    stubLegendLayout();
    const board = renderRows(withUsage(55, 0xcd, true));
    const caps = within(board).getAllByRole('button');
    const legend = within(within(board).getByRole('button', { name: 'CapsLock' })).getByText(
      'Media: Play/Pause',
    );

    expect(legend).toHaveClass('cap-scroll');
    expect(legend.style.getPropertyValue('--cap-travel')).toBe('-46px');
    expect(legend.style.getPropertyValue('--cap-duration')).toBe('5.1s');
    expect(caps.filter((cap) => cap.querySelector('.cap-scroll'))).toHaveLength(1);
  });

  it('leaves a legend a couple of pixels over the cap still', () => {
    stubLegendLayout();
    const board = renderRows(withUsage(56, 0x49));
    const cap = within(board).getByRole('button', { name: 'A' });

    expect(cap).toHaveTextContent('Insert');
    expect(cap.querySelector('.cap-scroll')).toBeNull();
  });

  it('gives a changed legend a fresh node so its travel starts at the cap edge', () => {
    stubLegendLayout();
    const props = { layer: 'top' as const, selected: null, disabled: false, onSelect: vi.fn() };
    const { rerender } = render(<KeymapBoard rows={withUsage(55, 0xcd, true)} {...props} />);
    const first = screen.getByRole('button', { name: 'CapsLock' }).lastElementChild;
    rerender(<KeymapBoard rows={withUsage(55, 0xe9, true)} {...props} />);
    const next = screen.getByRole('button', { name: 'CapsLock' }).lastElementChild;

    expect(first).toHaveTextContent('Media: Play/Pause');
    expect(next).toHaveTextContent('Media: Volume up');
    expect(next).not.toBe(first);
  });
});
