import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../lib/playwright-adapter.mjs';
import { checkFinding } from '../lib/contract.mjs';

const spec = (title, status, extra = {}) => ({
  title,
  file: 'security/security.spec.ts',
  line: 40,
  tests: [{ status, annotations: [], results: [{ error: { message: 'boom' } }], ...extra }],
});

const report = {
  suites: [
    {
      title: 'security/security.spec.ts',
      suites: [
        {
          title: 'security :: Demo (qa)',
          specs: [
            spec('HSTS is set', 'expected'),
            spec('CSP is set', 'expected', { annotations: [{ type: 'known-issue', description: 'No CSP header - third party' }] }),
            spec('nosniff', 'expected', { annotations: [{ type: 'known-issue-fixed', description: 'now passes' }] }),
            spec('Cookies are Secure', 'unexpected', { results: [{ error: { message: '\u001b[31mExpected: true\u001b[39m\nReceived: false' } }] }),
            spec('TLS expiry', 'flaky', { results: [{ error: { message: 'timeout' } }, {}] }),
            spec('Skipped check', 'skipped'),
          ],
        },
      ],
    },
  ],
};

const result = normalize({ report, capability: 'security', sha: 'abc1234def', artifact: 'a.json', testDir: 'tests' });
const byStatus = (s) => result.findings.filter((f) => f.status === s);

test('counts passing tests and ignores skipped ones', () => {
  assert.equal(result.total, 5);
  assert.equal(result.passed, 3);
});

test('a test that fails after retry is a confirmed high-severity failure', () => {
  const [f] = byStatus('failed');
  assert.equal(f.severity, 'high');
  assert.equal(f.verdict, 'confirmed');
  assert.equal(f.location, 'tests/security/security.spec.ts:40');
  assert.match(f.evidence, /Expected: true \| Received: false/);
  assert.doesNotMatch(f.evidence, /\u001b/);
});

test('a test that passes only on retry is a plausible low-severity flake', () => {
  const [f] = byStatus('flaky');
  assert.equal(f.severity, 'low');
  assert.equal(f.verdict, 'plausible');
});

test('known issues are recorded as info, not failures', () => {
  const [f] = byStatus('known-issue');
  assert.equal(f.severity, 'info');
  assert.match(f.evidence, /No CSP header/);
});

test('a known issue that now passes is flagged for removal', () => {
  const [f] = byStatus('known-issue-fixed');
  assert.match(f.suggestedFix, /Remove/);
});

test('every finding matches the schema', () => {
  assert.equal(result.findings.length, 4);
  result.findings.forEach(checkFinding);
});

test('the schema rejects a finding with an unknown severity', () => {
  const bad = { ...result.findings[0], severity: 'urgent' };
  assert.throws(() => checkFinding(bad), /Invalid finding/);
});
