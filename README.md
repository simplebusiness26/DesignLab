# DesignLab

**An evolutionary UI experimentation engine for existing mobile applications.**

DesignLab takes a mobile app that already works, generates several genuinely
different UI/UX directions for it, implements each one on an isolated Git
branch, proves that none of them broke the app, builds an installable APK per
design, and uses your choice of winner to seed the next generation.

It is not a prompt-to-UI generator. It operates on functioning applications
and produces multiple competing, installable implementations while keeping
the underlying behaviour intact.

```
designlab inspect  →  App Manifest + Functionality Contract
        ↓
designlab round    →  N different design briefs
        ↓             N isolated branches/worktrees
                      N parallel implementations
                      protection + verification gates
                      design review
        ↓             successful branches pushed → GitHub Actions builds an APK each
designlab choose   →  winner + your feedback becomes the parent of generation N+1
```

---

## The core idea

> **Functionality is frozen. Design is flexible.**

Every DesignLab guarantee that matters is enforced by deterministic code, not
by asking a model nicely:

| Guarantee | How it is enforced |
| --- | --- |
| A design cannot change behaviour | Git diff against the Functionality Contract, run after every attempt |
| Designs are genuinely different | Thirteen-dimension diversity scoring, with re-planning when a set collides |
| Candidates cannot contaminate each other | One Git worktree and branch per candidate, verified before dispatch |
| The target's base branch is never harmed | Push guard + protected-branch list; DesignLab only pushes branches it created |
| "Tests passed" means tests ran | A gate is `passed` only if its command executed and exited zero |
| "APK built" means GitHub produced one | Build state is derived solely from real Actions API responses |

---

## Requirements

- **Node.js 20.10+**
- **Git 2.15+** (worktree support)
- **[Claude Code CLI](https://claude.com/claude-code)**, authenticated —
  DesignLab drives models through it rather than embedding an API client, so
  it inherits your existing authentication and model access.
- **GitHub token** (`GITHUB_TOKEN`), only for pushing design branches and
  reading APK build results.

Run `designlab doctor` to check all of the above.

---

## Install

```bash
git clone https://github.com/simplebusiness26/DesignLab
cd DesignLab
npm install
npm run build
npm link          # optional: puts `designlab` on your PATH
```

Everything works without `npm link` via `node bin/designlab.js …`.

---

## First run

```bash
# 1. Create the workspace and config
designlab init --repo https://github.com/you/your-app --branch main

# 2. Analyse the target app once. Cached by commit SHA.
designlab inspect

# 3. Review what DesignLab decided is off-limits
designlab protect

# 4. Rehearse the whole pipeline with no model calls and no pushes
designlab round --designs 4 --dry-run

# 5. Run it for real
designlab round --designs 4 --diversity high

# 6. See what happened, including APK build state
designlab status --refresh

# 7. Pick a winner and seed the next generation
designlab choose 1 C --feedback "C wins overall. I prefer A's map and B's profile."

# 8. Generation 2, starting from C's branch
designlab round --designs 4
```

---

## Commands

| Command | What it does |
| --- | --- |
| `designlab init` | Creates `designlab.config.json`, the workspace, and JSON Schemas |
| `designlab inspect` | Analyses the target app → App Manifest, analysis, Functionality Contract |
| `designlab round` | Plans, implements, verifies and reviews one generation of designs |
| `designlab status` | Manifest, contract, rounds, candidates, gate results, build state, usage |
| `designlab choose <round> <slot>` | Records the winner and plans the next generation |
| `designlab protect` | Shows the contract, classifies paths, or checks a branch against it |
| `designlab workflow` | Shows or writes the Actions workflow that builds an APK per branch |
| `designlab clean` | Removes local worktrees (never remote branches) |
| `designlab doctor` | Checks git, node, the Claude CLI, workspace and token |

Global flags: `--dry-run`, `--json`, `--log-level`, `--repo`, `--cwd`,
`--config`.

Full reference: [`docs/cli.md`](docs/cli.md).

---

## How the agents are used

DesignLab is deliberately economical about which model does what.

| Role | Model | Responsibility | Invoked |
| --- | --- | --- | --- |
| **Lead** | Fable 5 | Strategy, design generation, creative review, evolution planning | Once per round, once per candidate review |
| **Builder** | Sonnet 5 | Implementing one brief inside one worktree | Once per candidate, plus retries |
| **Reviewer** | Opus 4.8 | Diagnosing failures a builder could not fix | Only after a builder has already failed a retry |

Deterministic software — not a model — handles Git, worktrees, diffing,
protection checks, gate execution, workflow generation and build polling.

The roles map to models in `designlab.config.json`, so switching models is a
config change, not a code change. Matching agent definitions live in
[`.claude/agents/`](.claude/agents/) for use with Claude Code directly.

More: [`docs/architecture.md`](docs/architecture.md).

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | System design, orchestration, data flow, diagrams |
| [`docs/cli.md`](docs/cli.md) | Every command, flag and exit code |
| [`docs/configuration.md`](docs/configuration.md) | `designlab.config.json` reference |
| [`docs/functionality-contract.md`](docs/functionality-contract.md) | How protection is decided and enforced |
| [`docs/design-rounds.md`](docs/design-rounds.md) | Diversity, briefs, gates, review |
| [`docs/apk-pipeline.md`](docs/apk-pipeline.md) | Android build workflows and build state |
| [`docs/evolution.md`](docs/evolution.md) | Winners, feedback and generations |
| [`docs/usage-optimisation.md`](docs/usage-optimisation.md) | Where the tokens go and how they are bounded |
| [`docs/security.md`](docs/security.md) | Trust boundaries and blast radius |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Common failures and fixes |
| [`docs/adr/`](docs/adr/) | Architectural decision records |

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest — includes integration tests over real git repos
npm run verify      # all three

npm run acceptance  # full CLI flow against a temp fixture app (no tokens)
npm run live-smoke  # real model calls — costs money, run manually
```

The integration tests build real Git repositories in a temp directory, create
real worktrees, and run real verification commands. They never touch a
repository outside the temp tree. Model calls are replaced by a deterministic
runner that drives the *production* orchestrator — the same substitution
`--dry-run` makes — so the tests exercise the real pipeline rather than a
parallel fake of it.

---

## Status and scope

V1 is the engine. Deliberately **not** built yet: a dashboard, billing, teams,
accounts, iOS builds, store publishing, analytics. The architecture leaves
room for them; the engine comes first.

See [`docs/roadmap.md`](docs/roadmap.md) for what is implemented, what is
partial, and what is future work.

## Licence

MIT
