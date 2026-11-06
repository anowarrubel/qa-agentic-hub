import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { root } from './contract.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repoDir = (project) =>
  join(root, 'projects', project.name, 'workspace', project.repos[0].slug.split('/').pop());

/** The existing clone and its current commit, without fetching. */
export function currentCheckout(project) {
  const dir = repoDir(project);
  if (!existsSync(join(dir, '.git'))) throw new Error(`No checkout at ${dir}; run without --no-checkout first`);
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

/**
 * Clones the project's first repo into projects/<name>/workspace (or updates an
 * existing clone), checks out the base branch, and returns the path plus SHA.
 */
export function checkout(project) {
  const repo = project.repos[0];
  const dir = repoDir(project);
  mkdirSync(dirname(dir), { recursive: true });

  if (existsSync(join(dir, '.git'))) {
    git(dir, 'fetch', 'origin', repo.base);
    git(dir, 'checkout', '--quiet', '--detach', `origin/${repo.base}`);
  } else {
    execFileSync('git', ['clone', '--quiet', '--branch', repo.base, repo.url, dir], { stdio: 'inherit' });
  }
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}
