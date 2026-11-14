import { TabRow } from '@/components/tab-row';
import type { View } from '@/lib/settings';

export type { View };

const views = [
  { id: 'keys', label: 'Keys', note: 'Remap keys on the top and Fn layers.' },
  { id: 'screen', label: 'Screen', note: 'Set the clock and play GIFs on the keyboard screen.' },
  {
    id: 'light',
    label: 'Lighting',
    note: 'Set an effect for the whole board, or paint colours on individual keys.',
  },
  {
    id: 'device',
    label: 'Device',
    note: 'Set the response time, the sleep time and the shortcuts to block.',
  },
] as const;

type ViewTabsProps = {
  view: View;
  disabled: boolean;
};

/**
 * The four views. None carries a link badge: the Screen view still sends the
 * clock over 2.4 GHz, and Lighting and Device keep working there, so a dot on
 * a view would claim more than it knows. The controls that need USB mark
 * themselves: the Per-key tab, the animation card and the shortcut rows.
 */
export function ViewTabs({ view, disabled }: ViewTabsProps) {
  const active = views.find((item) => item.id === view) ?? views[0];

  return <TabRow label="View" items={views} note={active.note} disabled={disabled} />;
}
