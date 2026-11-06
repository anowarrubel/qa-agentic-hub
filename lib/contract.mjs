import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ajv = new Ajv({ allErrors: true });
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const validateProject = ajv.compile(readJson(join(root, 'schemas', 'project.schema.json')));
const validateFinding = ajv.compile(readJson(join(root, 'schemas', 'finding.schema.json')));

const describe = (errors) => errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

/** Throws with a readable message if the project contract is malformed. */
export function checkContract(contract) {
  if (!validateProject(contract)) {
    throw new Error(`Invalid project contract: ${describe(validateProject.errors)}`);
  }
  return contract;
}

/** Throws if a finding doesn't match the normalized schema. */
export function checkFinding(finding) {
  if (!validateFinding(finding)) {
    throw new Error(`Invalid finding "${finding.title}": ${describe(validateFinding.errors)}`);
  }
  return finding;
}

export function loadProject(name) {
  const path = join(root, 'projects', name, 'project.config.json');
  if (!existsSync(path)) throw new Error(`No project "${name}" (expected ${path})`);
  return checkContract(readJson(path));
}
