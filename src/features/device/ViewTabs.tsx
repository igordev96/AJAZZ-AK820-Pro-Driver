import { TabRow } from '@/components/tab-row';
import type { View } from '@/lib/settings';

export type { View };

const views = [
  { id: 'keys', label: 'Keys', note: 'Remap keys on the top and Fn layers.' },
  { id: 'screen', label: 'Screen', note: 'Set the clock and play GIFs on the keyboard screen.' },
  {
    id: 'light',
    label: 'Lighting',
    note: 'Pick one of the 20 effects and set the controls it offers.',
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
  /** True over the 2.4 GHz receiver, where the screen has no channel. */
  wireless?: boolean;
};

export function ViewTabs({ view, disabled, wireless = false }: ViewTabsProps) {
  const active = views.find((item) => item.id === view) ?? views[0];
  const items = views.map((item) => ({
    ...item,
    badge: wireless && item.id === 'screen',
  }));

  return <TabRow label="View" items={items} note={active.note} disabled={disabled} />;
}
