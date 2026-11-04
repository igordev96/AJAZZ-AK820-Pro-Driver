import { Download, FileJson, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { readProfile, type ParsedProfile } from '@/lib/profile';

export type ProfileMenuProps = {
  /** True while a transfer or a probe holds the page. */
  disabled: boolean;
  onExport: () => void;
  onImport: (profile: ParsedProfile) => void;
};

/**
 * One file for a new machine. Import replaces the drafts on screen and says so;
 * the keyboard is untouched until an upload.
 */
export function ProfileMenu({ disabled, onExport, onImport }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ParsedProfile | null>(null);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPending(null);
    setProblems([]);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;

    try {
      const result = readProfile(await file.text());
      if (!result.ok) {
        setPending(null);
        setProblems(result.problems);
        return;
      }
      setProblems([]);
      setPending(result.profile);
    } catch {
      setPending(null);
      setProblems(['The file could not be read.']);
    }
  };

  const confirm = () => {
    if (!pending) return;
    onImport(pending);
    setOpen(false);
    reset();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Profile" disabled={disabled}>
          <FileJson aria-hidden="true" />
          <span className="hidden sm:inline">Profile</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80">
        {pending ? (
          <>
            <p className="text-xs text-ivory">Replace what is on screen with this profile?</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted">
              <li>
                {pending.top.size} top-layer key{pending.top.size === 1 ? '' : 's'} and{' '}
                {pending.fn.size} Fn override{pending.fn.size === 1 ? '' : 's'}.
              </li>
              <li>The device settings and the lighting.</li>
              <li>Nothing is sent until you upload.</li>
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={confirm}>
                Replace drafts
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted">
              One file with both key layers, the device settings and the lighting, so another
              machine can start from the same drafts.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onExport();
                  setOpen(false);
                }}
              >
                <Download aria-hidden="true" />
                Export profile
              </Button>
              <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>
                <Upload aria-hidden="true" />
                Import profile
              </Button>
              <input
                ref={input}
                type="file"
                accept="application/json,.json"
                aria-label="Choose a profile file"
                className="sr-only"
                onChange={(event) => {
                  void pick(event.currentTarget.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </div>

            {problems.length ? (
              <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-rust">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
