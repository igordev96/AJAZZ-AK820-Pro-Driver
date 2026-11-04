import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Sonner paints its own surfaces, so the palette goes in through the variables
 * it reads. Rich colours are on, with every background set to the panel colour:
 * the tone ends up in the icon and the text, the way the log colours a line.
 */
const palette = {
  '--normal-bg': 'var(--color-surface)',
  '--normal-text': 'var(--color-ivory)',
  '--normal-border': 'var(--color-line)',
  '--success-bg': 'var(--color-surface)',
  '--success-text': 'var(--color-sage)',
  '--success-border': 'var(--color-line)',
  '--error-bg': 'var(--color-surface)',
  '--error-text': 'var(--color-rust)',
  '--error-border': 'var(--color-line)',
  '--warning-bg': 'var(--color-surface)',
  '--warning-text': 'var(--color-brass)',
  '--warning-border': 'var(--color-line)',
  '--info-bg': 'var(--color-surface)',
  '--info-text': 'var(--color-ivory)',
  '--info-border': 'var(--color-line)',
  '--border-radius': '12px',
} as ToasterProps['style'];

/** The only toast surface in the app. */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      duration={4000}
      visibleToasts={3}
      richColors
      style={palette}
    />
  );
}
