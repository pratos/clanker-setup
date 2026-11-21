// Load a package from the skill's own node_modules, or from a user cache when the skill folder is read-only
// (home-manager installs skills from the Nix store). Never installs into the skill folder itself.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function load(name, version, from) {
  for (const base of [from, process.cwd()]) {
    try { return await import(pathToFileURL(Bun.resolveSync(name, base)).href); } catch {}
  }
  const cache = join(homedir(), '.cache', 'claude-skills-deps');
  mkdirSync(cache, { recursive: true });
  if (!existsSync(join(cache, 'package.json'))) writeFileSync(join(cache, 'package.json'), '{ "private": true }\n');
  if (!existsSync(join(cache, 'node_modules', name))) {
    const r = spawnSync('bun', ['add', `${name}@${version}`], { cwd: cache, stdio: 'ignore' });
    if (r.status !== 0) throw new Error(`could not install ${name}@${version} into ${cache}`);
  }
  return import(pathToFileURL(Bun.resolveSync(name, cache)).href);
}
