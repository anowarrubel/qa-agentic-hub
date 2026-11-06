---
status: research, with a Phase 1 spine implemented (see README)
owner: Anowar Hossain
created: 2026-11-05
scope: Design for a central agentic-QA hub that serves many projects/codebases.
note: Design for a QA-capability platform: one orchestration hub over many independent
      codebases. Research stage; no implementation yet.
---

# Agentic QA Hub - architecture design

A central hub from which a QA-engineer agent works across many unrelated projects:
checkout the latest code, analyze it, then generate and run tests of every type —
**functional automation, security, analytics, performance, SEO, accessibility, and
visual regression** - per project, with shared machinery and per-project configuration.

The idea is one knowledge and orchestration hub over several product repos, applied to
QA: a shared capability platform over many independent codebases.

---

## Locked decisions (2026-11-05)

1. **Generated tests live in each project's own repo** - PR'd back, run in that
   project's CI, versioned with the code they guard. The hub orchestrates, generates and
   reports; it never hoards tests.
2. **Execution is hybrid** - authoring + static analysis run locally/in-session; executing
   suites that need a consistent, isolated environment (performance, visual regression,
   DAST, full e2e) run on a cloud/CI runner pool.
3. **Checkout is hybrid** - iterative hub work uses git worktrees (fast, isolated,
   auto-cleaned); scheduled/CI runs use ephemeral clones stamped with the SHA.

---

## The core mental model

Three dimensions vary independently. Keep them orthogonal and the system stays small:

| Dimension | Varies by | Owned by |
|---|---|---|
| **Projects** | codebase: stack, repos, URLs, environments, credentials | a per-project config file |
| **Capabilities** | test type: functional, security, analytics, perf, SEO, a11y, visual | the hub (shared) |
| **Tools** | both: Cypress vs Playwright, Percy vs Playwright-snapshots, semgrep vs CodeQL | a capability *adapter* (per project × capability) |

- Adding a **project** = one config file (+ adapters for its tool choices).
- Adding a **capability** = one shared skill + specialist agent + finding schema.
- Swapping a **tool** = one adapter.

None forces a change in the others. That decoupling is the whole design.

---

## Layered architecture

```
┌─ QA Orchestrator (hub) ────────────────────────────────────────────┐
│  routes: which project · which capability · which environment       │
│  owns the lifecycle: checkout → analyze → generate → run → report   │
└──────────────┬──────────────────────────────┬──────────────────────┘
               │                               │
   ┌───────────▼───────────┐       ┌───────────▼────────────────────┐
   │ CAPABILITY LIBRARY     │       │ PROJECT REGISTRY               │
   │ (shared, hub-owned)    │       │ (one config per project)       │
   │  functional  security  │       │  stack fingerprint             │
   │  analytics   perf      │       │  repos + base branch           │
   │  seo  a11y   visual    │       │  envs (local/qa/stage/prod)    │
   │  each = skill + agent  │       │  enabled capabilities + tools  │
   │       + finding schema │       │  secret refs · artifact store  │
   └───────────┬────────────┘       └────────────┬───────────────────┘
               │   bound at runtime by            │
               └──────── CAPABILITY ADAPTERS ──────┘
                 (per project × capability: tool-specific glue)
```

### Directory shape

```
qa-hub/
├── hub/
│   ├── agents/                     ← capability specialists (shared)
│   │   ├── functional-test-author.md
│   │   ├── security-scanner.md
│   │   ├── analytics-verifier.md
│   │   ├── perf-analyst.md
│   │   ├── seo-auditor.md
│   │   ├── accessibility-reviewer.md
│   │   └── visual-regression.md
│   ├── skills/                     ← lifecycle workflows (shared, config-driven)
│   │   ├── qa-checkout.md           ← pull latest, fingerprint the repo
│   │   ├── qa-analyze.md            ← gap analysis: tested vs untested surfaces
│   │   ├── qa-generate.md           ← dispatch to the right capability author(s)
│   │   ├── qa-run.md                ← execute, gated by env/deploy state
│   │   └── qa-report.md             ← normalize findings → artifacts + tickets/PRs
│   ├── rules/                      ← the invariant contract (env-gating, secrets, PoM)
│   └── settings.json               ← org defaults (permissions, hooks)
├── capabilities/                   ← per-capability: finding schema, runners, policies
│   ├── visual/      (baseline policy, diff thresholds)
│   ├── security/    (semgrep/osv/gitleaks/ZAP adapters + SARIF normalizer)
│   ├── performance/ (lighthouse/k6 budgets)
│   └── …
├── scripts/                        ← guardrails (config validator, fingerprinter, report render)
└── projects/
    ├── project-a/                  ← a sample project
    │   ├── project.config.json     ← the project contract (below)
    │   ├── skills/                 ← project-only overrides/tweaks (rare)
    │   ├── adapters/               ← this project's tool choices (Cypress, axe, Lighthouse…)
    │   ├── workspace/<repos…>      ← checked-out code (gitignored worktrees)
    │   └── artifacts/              ← runs, baselines, SARIF, traces (object store)
    └── <project-b>/ …              ← another codebase, different stack + tools, same shape
```

Skills and agents resolve by a **most-specific-wins** rule: a project inherits
every capability from the hub and overrides only what's genuinely different. The healthy
default is **projects differ by config, not forked skills** - overrides are the exception.

---

## The project contract

The one file a new project supplies. Everything a capability needs to self-configure:

```jsonc
{
  "name": "project-b",
  "repos": [{ "slug": "org/web", "base": "main", "checkout": "worktree" }],
  "stack": { "autodetect": true },             // or pin: next, django, rails, …
  "environments": {
    "local": { "url": "http://localhost:3000", "safeToMutate": true },
    "qa":    { "url": "https://qa.example.com", "safeToMutate": false },
    "prod":  { "url": "https://example.com",    "readOnly": true }
  },
  "capabilities": {
    "functional":    { "tool": "playwright", "runsAgainst": "local|qa-after-deploy" },
    "security":      { "sast": ["semgrep"], "deps": "osv-scanner",
                       "secrets": "gitleaks", "dast": "zap@qa" },
    "analytics":     { "layer": "gtm-datalayer", "spec": "events.yaml" },
    "performance":   { "tool": "lighthouse", "budgets": "budgets.json", "runsAgainst": "qa" },
    "seo":           { "tool": "lighthouse+structured-data", "crawl": "sitemap" },
    "accessibility": { "tool": "axe", "wcag": "2.2-AA" },
    "visual":        { "tool": "playwright-snapshots", "baselines": "s3://…/project-b",
                       "viewports": ["390x844","1280x800"] }
  },
  "secrets": { "ref": "vault://project-b/*" },  // references only, never values
  "artifacts": { "store": "s3://qa-artifacts/project-b" },
  "report": { "tickets": "jira://PROJB", "prs": "github://org/web" }
}
```

A hub script (`scripts/validate-project.mjs`) gates every lifecycle run on this file being
well-formed. Small validation scripts like this keep the agents honest.

---

## The capability contract

Every capability - however different its underlying tool - presents the same seams, so the
orchestrator and reporting are uniform:

- **Input:** the project contract + a target (repo worktree, or an environment URL).
- **Author step:** a specialist agent generates tests in the project's tool via its adapter.
- **Run step:** a runner executes and emits raw tool output.
- **Normalize step:** the adapter maps raw output → the **normalized finding schema**:

```jsonc
{
  "capability": "accessibility",
  "severity": "high",                 // critical|high|medium|low|info
  "status": "failed",                 // failed|flaky|known-issue|known-issue-fixed
  "title": "Form field has no label",
  "location": "src/components/Contact.tsx:42 · /contact",
  "evidence": "axe rule label; <input id='email'> has no accessible name",
  "artifact": "s3://…/run-9f2/axe-contact.json",
  "sha": "a1b2c3d",
  "verdict": "confirmed",             // confirmed|plausible (post adversarial verify)
  "suggestedFix": "Associate a <label for='email'> …"
}
```

One schema for axe, semgrep, Lighthouse and visual diffs alike - so the dashboard, the
ticket body and the PR comment look identical regardless of source.

---

## The lifecycle

`checkout → analyze → generate → run → report`, each a shared skill reading the contract:

1. **Checkout** - worktree per repo (iterative) or ephemeral clone (CI), SHA recorded and
   stamped onto every finding and baseline.
2. **Analyze / fingerprint** - detect stack, enumerate surfaces (routes, components, APIs,
   events), diff against existing tests → a **coverage gap map** per capability. This is
   where the agent adds the most value: deciding *what* to test, not just how.
3. **Generate** - the orchestrator fans out enabled capabilities to their specialist
   agents **in parallel** (the work is independent, so it fans out cleanly). Each authors
   tests into the project repo via its adapter.
4. **Run** - execute, **gated by environment + deploy state** (below). Executing suites go
   to the cloud runner pool; static analysis runs in-session.
5. **Report** - normalize all findings into the one schema, persist artifacts to the
   project's store, and (human-gated) open PRs for the generated tests + file tickets for
   findings.

---

## Invariants - the portable contract every project inherits

What makes the output *trustworthy*, not just automated:

- **Environment-gating is law.** Never run an *executing* test against a deployed env for
  an *undeployed* change. Hermetic/static checks (SAST, dep scan, secret scan, unit,
  structure/link checks) gate pre-merge; **executing** runs (DAST, e2e, perf, visual
  against a URL) run **post-deploy**.
- **Secrets are references, never values** - per-project, per-user, from a secret manager;
  nothing in config or agent context.
- **Human-as-gate for anything outward** - PRs, tickets, prod writes, posting findings:
  propose, don't execute.
- **Findings carry evidence + a SHA and are adversarially verified.** A finding handed back
  "confirmed" without an independent check is the classic agent failure. Security and
  correctness findings get a separate verify pass before they reach a human.
- **Artifacts live outside context** - baselines, traces, SARIF in an object store,
  referenced by URL. Visual baselines are keyed by SHA + viewport + environment.
- **Tests belong in the project repo** - generated specs are PR'd into the codebase and run
  in its CI; the hub never becomes a parallel, drifting test home.

---

## Agent topology

- **One orchestrator** (the QA-lead persona) - routing + lifecycle; holds little itself.
- **One specialist agent per capability**, each scoped to only the tools it needs (the
  accessibility reviewer is the model to copy). They run **in parallel across
  capabilities** and **in worktrees across projects**, since the work is independent.
- **A project-persona overlay** that loads `project.config.json` + that project's
  conventions, so a specialist behaves correctly on each codebase without the hub knowing
  project specifics.

---

## Capability notes (per test type)

| Capability | Static (pre-merge) | Executing (post-deploy) | Typical tools | Artifact |
|---|---|---|---|---|
| Functional | generate specs; typecheck | e2e run | Playwright / Cypress / Maestro | run report, video |
| Security | SAST, dep scan, secret scan | DAST | semgrep/CodeQL, osv/snyk, gitleaks, ZAP | SARIF |
| Analytics | assert data-layer push logic (unit) | beacon/event capture | GTM/Adobe data layer, intercepts | event spec diff |
| Performance | budget lint | Lighthouse/CWV, load | Lighthouse, k6 | trace, JSON |
| SEO | meta/structured-data static checks | crawl + Lighthouse SEO | Lighthouse, schema validator | crawl report |
| Accessibility | component/axe unit | axe/pa11y page sweep | axe-core, pa11y | violation JSON |
| Visual regression | - | snapshot diff | Playwright snapshots / Percy | baseline + diff images |

Analytics shows why the split matters: the *push logic* is unit-tested
pre-merge; the *beacon actually fires* is validated post-deploy. The hub should encode that
split as the analytics capability's default, not leave it to each project.

---

## CI integration

- **Pre-merge (project CI):** hermetic capabilities only - SAST, dep/secret scan, unit,
  the generated specs' typecheck/lint, and a *hermetic integrity check* on the suite
  (does it still select real, tagged cases?). No executing run touches a deployed env here.
- **Post-deploy (cloud runner pool):** functional e2e, DAST, performance, SEO crawl, a11y
  sweep, visual regression - against the just-deployed environment, SHA-stamped.
- The hub **generates** the CI wiring for each project from its contract; the project owns
  and runs it.

---

## Phasing - prove the seams before scaling

1. Hub skeleton + **one** sample project + **one** capability (functional). Prove the
   project contract and the capability/adapter seams end to end.
2. Add **accessibility** (cheap, high value) - proves capabilities
   compose and report through the one schema.
3. Add a **second project on a different stack + tool** (e.g. Playwright, not Cypress) —
   proves the adapter layer truly decouples tool from capability.
4. Fan out the remaining capabilities and projects - each is now additive config/adapter,
   not new machinery.

---

## Risks & open questions

- **Tool sprawl in adapters.** Each project × capability adapter is maintenance. Mitigate
  with a small set of blessed default tools; a project opts out only with reason.
- **Finding-schema drift.** The normalized schema is load-bearing; version it and validate
  on write, or dashboards silently rot.
- **Visual-baseline ownership.** Who approves a new baseline, and where it's stored, is a
  governance question, not a technical one - decide before enabling visual regression.
- **Cloud-runner cost + secrets.** The runner pool needs per-project credentials and a cost
  ceiling; a runaway perf/visual matrix is the likely budget surprise.
- **Capability versioning across projects.** As the hub fixes a capability, every project
  gets it at once. Treat shared skills like a published package (changelog; consider
  pinning a hub version per project) once there are 3+ projects.
