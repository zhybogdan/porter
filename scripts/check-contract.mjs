// The contract check: regenerate openapi.json and the clients from the code,
// then fail if any generated file differs from what was there before.
//
//   node scripts/check-contract.mjs
//
// On CI the checkout is the commit, so a difference means the commit carries a
// stale contract. Locally it means the regeneration just changed files that
// belong in the same commit as the code that changed them.
//
// Settings: contract.config.json at the project root. The backend kit's edit
// guard reads the same `outputs`.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const config = JSON.parse(readFileSync(join(root, 'contract.config.json'), 'utf8'));

function snapshot() {
  const files = new Map();
  const walk = (path) => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path)) walk(join(path, name));
      return;
    }
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    files.set(relative(root, path).replaceAll('\\', '/'), hash);
  };
  for (const output of config.outputs) walk(resolve(root, output));
  return files;
}

const before = snapshot();

for (const step of config.generate) {
  console.log(`› ${step}`);
  const run = spawnSync(step, { shell: true, stdio: 'inherit', cwd: root });
  if (run.status !== 0) {
    console.error(`✘ generation failed: ${step}`);
    process.exit(1);
  }
}

const after = snapshot();
const changed = [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f)).sort();

if (changed.length) {
  console.error(`✘ the contract was stale: regeneration changed ${changed.length} file(s)`);
  for (const f of changed) {
    const kind = !before.has(f) ? 'added  ' : !after.has(f) ? 'removed' : 'changed';
    console.error(`  ${kind} ${f}`);
  }
  console.error('Review the diff and commit it together with the code that caused it.');
  process.exit(1);
}

console.log(`✔ contract matches the code (${after.size} generated files)`);
