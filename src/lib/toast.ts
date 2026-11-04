import { toast } from 'sonner';

/**
 * The app's short confirmations. Kept in one module so the tone and the wording
 * stay together, and so tests can observe them without mounting the toaster.
 *
 * A toast is never the only record of an action: the log keeps the detail and
 * the panel keeps the result.
 */
export const notify = {
  ok: (message: string) => toast.success(message),
  err: (message: string) => toast.error(message),
  warn: (message: string) => toast.warning(message),
  info: (message: string) => toast(message),
};
