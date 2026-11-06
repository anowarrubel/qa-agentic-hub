import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Severity a failing check gets, by capability. Anything unlisted is medium.
const FAILURE_SEVERITY = { security: 'high', accessibility: 'high', api: 'high' };

const ANSI = /\u001b\[[0-9;]*m/g;
const clean = (text = '') => text.replace(ANSI, '').trim();

/** First line of an error plus its Expected/Received lines, joined on one line. */
function summarize(message = 'test failed') {
  const lines = clean(message).split('\n').map((l) => l.trim()).filter(Boolean);
  const keep = [lines[0], lines.find((l) => l.startsWith('Expected')), lines.find((l) => l.startsWith('Received'))];
  return [...new Set(keep.filter(Boolean))].join(' | ').slice(0, 400);
}

/** Runs one capability's Playwright suite in the checked-out repo and returns the JSON report path. */
export function runPlaywright({ dir, capability, config, env, outDir, extraArgs = [] }) {
  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, `${capability}.playwright.json`);

  if (!existsSync(join(dir, 'node_modules'))) {
    const install = spawnSync('npm', ['ci'], { cwd: dir, stdio: 'inherit' });
    if (install.status !== 0) throw new Error('npm ci failed in the project workspace');
  }

  const args = ['playwright', 'test', config.suite, '--reporter=json', '--retries=1', ...extraArgs];
  if (config.project) args.push(`--project=${config.project}`);

  spawnSync('npx', args, {
    cwd: dir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath, SITE: '' },
  });

  if (!existsSync(reportPath)) throw new Error(`Playwright produced no report at ${reportPath}`);
  return reportPath;
}

function* walk(suite, titles = []) {
  const path = suite.title ? [...titles, suite.title] : titles;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) yield { spec, test, path };
  }
  for (const child of suite.suites ?? []) yield* walk(child, path);
}

/**
 * Turns a Playwright JSON report into normalized findings plus pass/total counts.
 * `testDir` is the folder Playwright reports spec paths relative to (e.g. 'tests').
 */
export function normalize({ report, capability, sha, artifact, testDir = 'tests' }) {
  const findings = [];
  let passed = 0;
  let total = 0;

  for (const suite of report.suites ?? []) {
    for (const { spec, test, path } of walk(suite)) {
      if (test.status === 'skipped') continue;
      total++;

      const title = [...path.filter((p) => !p.endsWith('.ts')), spec.title].join(' › ');
      const location = `${testDir}/${spec.file}:${spec.line}`;
      const base = { capability, title, location, artifact, sha };
      const note = (type) => test.annotations?.find((a) => a.type === type)?.description;

      if (test.status === 'unexpected') {
        const last = test.results.at(-1);
        findings.push({
          ...base,
          severity: FAILURE_SEVERITY[capability] ?? 'medium',
          status: 'failed',
          evidence: summarize(last?.error?.message),
          verdict: 'confirmed', // failed again on the retry
        });
        continue;
      }

      if (test.status === 'flaky') {
        findings.push({
          ...base,
          severity: 'low',
          status: 'flaky',
          evidence: clean(test.results[0]?.error?.message ?? 'passed only on retry').split('\n')[0].slice(0, 400),
          verdict: 'plausible', // failed once, passed on retry
        });
        continue;
      }

      passed++;
      if (note('known-issue')) {
        findings.push({ ...base, severity: 'info', status: 'known-issue', evidence: note('known-issue'), verdict: 'confirmed' });
      } else if (note('known-issue-fixed')) {
        findings.push({
          ...base,
          severity: 'info',
          status: 'known-issue-fixed',
          evidence: note('known-issue-fixed'),
          verdict: 'confirmed',
          suggestedFix: 'Remove the entry from the project known-issues list.',
        });
      }
    }
  }
  return { findings, passed, total };
}

export const readReport = (path) => JSON.parse(readFileSync(path, 'utf8'));
