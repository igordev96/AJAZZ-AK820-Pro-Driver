import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , type, notesPath] = process.argv;
const types = new Set(['patch', 'minor', 'major']);

if (!types.has(type)) {
  console.error('usage: npm run release -- <patch|minor|major> [notes-file]');
  process.exit(1);
}

const capture = (command) => execSync(command, { encoding: 'utf8' }).trim();
const run = (command) => execSync(command, { stdio: 'inherit' });

if (capture('git status --porcelain')) {
  console.error('The working tree has changes. Commit or stash them first.');
  process.exit(1);
}

const branch = capture('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`Releases are cut from main, and this is ${branch}.`);
  process.exit(1);
}

run(`npm version ${type} --no-git-tag-version`);

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;

const notes = notesPath ? readFileSync(notesPath, 'utf8').trim() : '';
// The release title is the first line of this message, so the version has to lead
// it. Notes that already open with the tag are left alone.
const message = !notes ? tag : notes.startsWith(tag) ? notes : `${tag} — ${notes}`;
const firstLine = message.split('\n')[0] ?? tag;

// The Release workflow reads the tag: its first line is the release title and
// the rest is the summary above the generated commit list.
const scratch = mkdtempSync(join(tmpdir(), 'ak820-release-'));
const messageFile = join(scratch, 'notes.txt');
writeFileSync(messageFile, `${message}\n`);

run('git add package.json package-lock.json');
run(`git commit -m "chore(release): bump the version to ${version}"`);
run(`git tag -a ${tag} -F "${messageFile}"`);

console.log(`\nTagged ${tag}: ${firstLine}\n`);
console.log('Push it when you are ready:');
console.log(`  git push origin main`);
console.log(`  git push origin ${tag}`);
console.log(
  '\nThe Release workflow then verifies the commit, deploys to Netlify and publishes the notes.',
);
