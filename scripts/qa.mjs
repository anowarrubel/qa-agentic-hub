#!/usr/bin/env node
/**
 * qa validate <project>
 * qa run <project> [capability,...] [--env=qa] [--no-checkout]
 *
 * run: validate the contract, check out the project at its base branch, run each
 * capability, normalize the results into findings, and write findings.json and
 * report.md under projects/<project>/artifacts/<timestamp>-<sha>/.
 * Exits 1 if any finding is a confirmed failure.
 */
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkFinding, loadProject, root } from '../lib/contract.mjs';
import { checkout, currentCheckout } from '../lib/checkout.mjs';
import { normalize, readReport, runPlaywright } from '../lib/playwright-adapter.mjs';
import { renderReport } from '../lib/report.mjs';

const [command, projectName, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const positional = rest.filter((a) => !a.startsWith('--'));

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (command === 'validate') {
  const names = projectName ? [projectName] : readdirSync(join(root, 'projects'));
  for (const name of names) {
    try {
      loadProject(name);
      console.log(`ok  ${name}`);
    } catch (error) {
      fail(`FAIL ${name}: ${error.message}`);
    }
  }
  process.exit(0);
}

if (command !== 'run' || !projectName) fail('Usage: qa validate [project] | qa run <project> [capability,...] [--env=qa]');

let project;
try {
  project = loadProject(projectName);
} catch (error) {
  fail(error.message);
}
const env = flags.env ?? 'qa';
if (!project.environments[env]) fail(`Unknown environment "${env}". Choose from: ${Object.keys(project.environments).join(', ')}`);

const wanted = positional[0] ? positional[0].split(',') : Object.keys(project.capabilities);
for (const name of wanted) if (!project.capabilities[name]) fail(`Project has no capability "${name}"`);

const { dir, sha: shaOut } = flags['no-checkout'] ? currentCheckout(project) : checkout(project);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(root, 'projects', project.name, 'artifacts', `${stamp}-${shaOut.slice(0, 7)}`);
mkdirSync(outDir, { recursive: true });

const findings = [];
const runs = [];
for (const capability of wanted) {
  console.log(`\n== ${project.name} / ${capability} @ ${shaOut.slice(0, 7)} (${env})`);
  const reportPath = runPlaywright({
    dir,
    capability,
    config: project.capabilities[capability],
    env: project.environments[env].env ?? {},
    outDir,
  });
  const result = normalize({ report: readReport(reportPath), capability, sha: shaOut, testDir: project.capabilities[capability].suite.split('/')[0], artifact: reportPath.replace(`${root}/`, '') });
  result.findings.forEach(checkFinding);
  findings.push(...result.findings);
  runs.push({ capability, passed: result.passed, total: result.total });
}

writeFileSync(join(outDir, 'findings.json'), JSON.stringify(findings, null, 2));
writeFileSync(join(outDir, 'report.md'), renderReport({ project: project.name, sha: shaOut, env, runs, findings }));

const failed = findings.filter((f) => f.status === 'failed');
console.log(`\n${runs.map((r) => `${r.capability} ${r.passed}/${r.total}`).join(' | ')}`);
console.log(`${findings.length} findings (${failed.length} failed). Report: ${outDir.replace(`${root}/`, '')}/report.md`);
process.exit(failed.length ? 1 : 0);
