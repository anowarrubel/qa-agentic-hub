import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContract, loadProject } from '../lib/contract.mjs';

const valid = () => structuredClone(loadProject('playwright-framework'));

test('the sample project contract is valid', () => {
  assert.equal(valid().name, 'playwright-framework');
});

test('a contract without repos is rejected', () => {
  const c = valid();
  delete c.repos;
  assert.throws(() => checkContract(c), /repos/);
});

test('an unknown capability is rejected', () => {
  const c = valid();
  c.capabilities.telepathy = { tool: 'playwright', suite: 'tests/x' };
  assert.throws(() => checkContract(c), /Invalid project contract/);
});

test('an unsupported tool is rejected', () => {
  const c = valid();
  c.capabilities.security.tool = 'magic';
  assert.throws(() => checkContract(c), /Invalid project contract/);
});

test('a project name must be lowercase and hyphenated', () => {
  const c = valid();
  c.name = 'Not Valid';
  assert.throws(() => checkContract(c), /name/);
});

test('loading a project that does not exist fails clearly', () => {
  assert.throws(() => loadProject('nope'), /No project "nope"/);
});
