# DesignLab — notes for Claude

An evolutionary UI experimentation engine for existing mobile applications.
Read [`docs/architecture.md`](docs/architecture.md) before making structural
changes.

## Commands

```bash
npm run verify        # typecheck + lint + test — run before committing
npm run build         # tsc → dist/
npm test              # vitest (unit + integration over real git repos)
npm run acceptance    # full CLI flow against a temp fixture app
node bin/designlab.js --help
```

## The two rules that shape this codebase

**1. Deterministic enforcement over instructions.** Where a guarantee could be
enforced either by asking a model to behave or by making misbehaviour
impossible, do the latter. Protection is a Git diff. Isolation is a worktree
lease. "Tests passed" is an exit code. If you find yourself adding a rule to a
prompt to fix a correctness problem, the fix probably belongs in code.

**2. Honest reporting over optimistic reporting.** Never infer a state that
could be derived from evidence. A skipped gate is `skipped`, never `passed`. A
build is `BUILD_SUCCESS` only when the Actions API returns a real artifact. An
unreachable API is not evidence of failure.

## Layout

| Path | Contents |
| --- | --- |
| `src/core` | Schemas, store, orchestrator, logger, errors, exec, ids, paths |
| `src/git` | Git client, worktree manager (isolation guarantees) |
| `src/agents` | Runner abstraction, Claude Code runner, mock runner, prompts |
| `src/analysis` | Inspection → App Manifest |
| `src/protection` | Contract construction, glob matcher, diff checker |
| `src/design` | Planning, diversity, builder, review |
| `src/testing` | Verification gates |
| `src/builds` | Actions workflows, build tracking |
| `src/lineage` | Winners, feedback, evolution |
| `src/cli` | Commands and context |

## Things that will bite you

- **`WorktreeManager` mutations are serialised on purpose.** `git worktree
  add/remove` race on `.git/worktrees/` metadata. Do not remove the internal
  queue; there is a test pinning it.
- **The orchestrator keeps one mutable `candidates` array.** `persist()` writes
  a snapshot and must never rebind it — builders run concurrently and hold
  references into it.
- **`ADVISORY_GATES` is the single source of truth** for which gates are
  decisive. `runGates` and `didAllRequiredGatesPass` both consult it; they must
  never disagree.
- **Protection rule resolution is source-first**, then specificity, then
  severity. A user rule must beat a more specific built-in.
- **Model output is never trusted.** Schema-validate it, then verify its
  claims independently.
- **Engine commits are marker-driven.** `[designlab-plumbing]` and
  `[designlab-identity]` commit-subject markers are how `merge-check` proves
  temporary work is dropped before a merge. Changing the markers breaks that
  proof; they live in `src/builds/candidate-identity.ts`.
- **`headSha` is the design content; `pushedSha` is the pushed tip.** Build
  tracking matches Actions runs against `pushedSha`; merge-check merges
  `headSha`. Conflating them either breaks build polling or leaks temporary
  commits into merges.
- **`limits.builderAttempts` below 3 makes Opus escalation unreachable** —
  escalation requires a spent retry AND a remaining attempt. A test pins the
  default.

## Adding a structured agent operation

1. Add the Zod schema to `src/core/schemas.ts`.
2. Add a case to `MockAgentRunner.synthesise` — otherwise `--dry-run` and the
   integration tests will not cover the new path.
3. Pass the schema as `outputSchema`; the runner enforces it via
   `--json-schema`.

## Testing

Integration tests build real Git repositories in temp directories and run the
production orchestrator. Only model calls are substituted, by the same
deterministic runner `--dry-run` uses — so a bug found in a test is a bug in
shipping code. Never point tests at a repository outside the temp tree.
