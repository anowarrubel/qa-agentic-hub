# qa-agentic-hub

Research + design for a **central agentic-QA hub** that serves many independent projects:
a QA-engineer agent checks out the latest code, analyzes it, then generates and runs tests
of every type - functional automation, security, analytics, performance, SEO, accessibility
and visual regression - per project, with shared machinery and per-project configuration.

The idea is one orchestration and knowledge hub over many independent codebases, applied
to QA: shared capabilities, per-project configuration, and generated tests that go back
into each project's own repo.

## Status

Design plus a small working spine. The architecture is in
[`docs/architecture.md`](docs/architecture.md).

What runs today (Phase 1):

- a **project contract** (`projects/<name>/project.config.json`) validated against
  `schemas/project.schema.json`
- **checkout** of the project's repo at its base branch, with the commit SHA recorded
- a **Playwright adapter** that runs a capability's suite, retries failures once, and
  normalizes the results into the **finding schema** (`schemas/finding.schema.json`):
  a failure that repeats is `confirmed`, one that passes on retry is `plausible`, and the
  project's known issues are carried through as `info`
- a **markdown report** and `findings.json` per run, and a non-zero exit on confirmed failures

There is no LLM agent in the loop yet. Generating tests, gap analysis and the adversarial
verify pass from the design are the next layer on top of this spine.

The first project is [`playwright-framework`](https://github.com/anowarrubel/playwright-framework).

## Usage

Needs Node 20+ and git.

```bash
npm install
npm run validate                                   # check every project contract
npm run qa -- run playwright-framework security,api
npm run qa -- run playwright-framework             # every capability in the contract
npm run qa -- run playwright-framework seo --env=prod
npm test                                           # unit tests for the contract and normalizer
```

Output lands in `projects/<name>/artifacts/<timestamp>-<sha>/` (gitignored):
`findings.json`, `report.md` and the raw Playwright JSON. Capabilities marked
`needsBrowser` (seo, accessibility) need the browsers installed in the project workspace
(`npx playwright install chromium` inside `projects/<name>/workspace/<repo>`).

### Decisions locked (2026-11-05)
1. Generated tests live in **each project's own repo** (PR'd back, run in its CI).
2. Execution is **hybrid** - local authoring + static analysis; cloud runners for executing
   suites (perf, visual, DAST, full e2e).
3. Checkout is **hybrid** - worktrees for iterative work, ephemeral clones for CI.

## Next steps
1. Add the agent layer: gap analysis and test generation, then the independent verify pass.
2. Add accessibility reporting through the same schema, then a second project on a
   different stack or tool (for example Cypress).
3. Cloud runners for the capabilities that need an isolated environment.
