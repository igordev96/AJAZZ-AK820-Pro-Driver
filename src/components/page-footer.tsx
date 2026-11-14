import { GitHubMark } from './github-mark';
import { APP_VERSION } from '@/lib/build';

const REPOSITORY_URL = 'https://github.com/igordev96/AJAZZ-AK820-Pro-Driver';

/** The quiet strip under the app: the repository, and the build to quote in a report. */
export function PageFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex h-11 w-full max-w-page items-center justify-between gap-4 px-4">
        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the project on GitHub"
          className="flex h-11 shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-ivory"
        >
          <GitHubMark className="size-3.5" />
          <span>GitHub</span>
        </a>

        {/* A cached page can outlive a release, so the build that is running has
            to be readable somewhere quiet. */}
        <span className="font-mono text-[10px] text-muted/70">build {APP_VERSION}</span>
      </div>
    </footer>
  );
}
