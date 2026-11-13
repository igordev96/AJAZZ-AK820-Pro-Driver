import { ChevronDown, Terminal, Settings2, Unplug, Usb } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProfileMenu, type ProfileMenuProps } from '@/features/profile/ProfileMenu';
import { cn } from '@/lib/utils';
import type { DeviceState } from './useDevice';

type AppHeaderProps = {
  device: DeviceState;
  supported: boolean;
  canReconnect: boolean;
  busy: boolean;
  logOpen: boolean;
  onConnect: () => void;
  onChooseAnother: () => void;
  onDisconnect: () => void;
  onAdvanced: () => void;
  advancedDisabled: boolean;
  onToggleLog: () => void;
  profileDisabled: boolean;
  onExportProfile: ProfileMenuProps['onExport'];
  onImportProfile: ProfileMenuProps['onImport'];
};

const hex = (value: number) => value.toString(16).toUpperCase().padStart(4, '0');

export function AppHeader({
  device,
  supported,
  canReconnect,
  busy,
  logOpen,
  onConnect,
  onChooseAnother,
  onDisconnect,
  onAdvanced,
  advancedDisabled,
  onToggleLog,
  profileDisabled,
  onExportProfile,
  onImportProfile,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const connected = device.status === 'connected';
  const label =
    device.status === 'connected'
      ? device.link
        ? (device.name ?? 'AK820')
        : 'Interface unavailable'
      : device.status === 'connecting'
        ? 'Connecting…'
        : device.status === 'error'
          ? 'Connection failed'
          : 'Not connected';

  const dot = cn(
    'size-1.5 rounded-full',
    connected && device.link && 'bg-sage',
    connected && !device.link && 'bg-rust',
    device.status === 'connecting' && 'animate-pulse bg-brass motion-reduce:animate-none',
    device.status === 'error' && 'bg-rust',
    device.status === 'idle' && 'bg-muted',
  );

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-page items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-key border border-line bg-keycap text-brass shadow-[inset_0_-2px_0_rgba(0,0,0,0.45)]">
            <Usb aria-hidden="true" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-[-0.01em]">AK820 Pro</p>
            <p className="hidden text-[11px] text-muted sm:block">Keys, screen and light</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span
            className="mr-1 hidden items-center gap-2 rounded-full border border-line/70 bg-surface/60 px-2.5 py-1 text-xs text-muted sm:flex"
            aria-live="polite"
          >
            <span className={dot} aria-hidden="true" />
            <span className="max-w-40 truncate text-ivory/90">{label}</span>
            {connected && device.vendorId !== null && device.productId !== null ? (
              <span className="font-mono text-[10px] text-muted/70">
                {hex(device.vendorId)}:{hex(device.productId)}
              </span>
            ) : null}
          </span>

          {connected ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onDisconnect}>
              <Unplug aria-hidden="true" />
              Disconnect
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                disabled={busy || !supported || device.status === 'connecting'}
                onClick={onConnect}
              >
                <Usb aria-hidden="true" />
                {device.status === 'connecting'
                  ? 'Connecting…'
                  : canReconnect
                    ? 'Reconnect'
                    : 'Connect keyboard'}
              </Button>
              {canReconnect ? (
                <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Other keyboards"
                      className="px-1.5"
                      disabled={busy || !supported || device.status === 'connecting'}
                    >
                      <ChevronDown aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64">
                    <p className="text-xs leading-relaxed text-muted">
                      This browser already allowed a keyboard, so{' '}
                      <strong className="font-medium text-ivory">Reconnect</strong> opens it without
                      the chooser.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setMenuOpen(false);
                        onChooseAnother();
                      }}
                    >
                      Choose another keyboard
                    </Button>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          )}

          <ProfileMenu
            disabled={profileDisabled}
            onExport={onExportProfile}
            onImport={onImportProfile}
          />

          <Button
            variant="ghost"
            size="sm"
            aria-label="Advanced"
            disabled={advancedDisabled}
            onClick={onAdvanced}
          >
            <Settings2 aria-hidden="true" />
            <span className="hidden sm:inline">Advanced</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            aria-expanded={logOpen}
            aria-controls="log-panel"
            onClick={onToggleLog}
          >
            <Terminal aria-hidden="true" />
            Log
          </Button>
        </div>
      </div>
    </header>
  );
}
