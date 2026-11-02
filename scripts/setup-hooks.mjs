import { execFileSync } from 'node:child_process';

// Points git at the committed hooks so they work without a hook manager.
// A checkout without git, such as a tarball, just skips it.
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  process.exit(0);
}
