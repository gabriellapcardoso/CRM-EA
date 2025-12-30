import { execSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function sh(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const hooksPath = resolve(root, '.githooks');
const preCommit = resolve(hooksPath, 'pre-commit');

if (!existsSync(preCommit)) {
  throw new Error(`Hook not found: ${preCommit}`);
}

// Ensure executable bit locally (some checkouts lose it).
chmodSync(preCommit, 0o755);

// Configure git to use repo-local hooks.
sh(`git config core.hooksPath "${hooksPath}"`);

console.log('\n✅ Git hooks installed.');
console.log('   - core.hooksPath:', hooksPath);
console.log('   - pre-commit:', preCommit);
console.log('\nTo run manually: npm run precheck');


