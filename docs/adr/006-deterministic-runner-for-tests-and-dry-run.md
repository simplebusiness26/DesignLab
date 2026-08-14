# ADR 006 — One deterministic runner serves both tests and `--dry-run`

**Status:** accepted

## Context

DesignLab needed two things that look unrelated:

1. A `--dry-run` mode so operators can validate configuration, protection
   rules and gate commands before spending tokens.
2. Integration tests for orchestration, isolation, gates, protection and
   lineage — which cannot call real models on every CI run.

The tempting answer is a test double for the orchestrator plus a separate
`--dry-run` code path. That yields tests that pass against a simulation of the
system rather than the system.

## Decision

Build one `MockAgentRunner` implementing the same `AgentRunner` interface as
the real backend, and use it for both. Everything else — the orchestrator, the
worktree manager, the gate pipeline, the protection checker, the lineage
engine — is the production code in both cases.

## Rationale

- Every model interaction in DesignLab is schema-shaped, so a runner that
  synthesises schema-valid answers can drive the entire pipeline. That
  property is what makes this possible at all.
- The integration tests then exercise the **real** orchestrator over real Git
  repositories with real worktrees and real verification commands. Only the
  model calls are substituted.
- Bugs found in tests are bugs in production code. During development this
  caught a state-mutation race in the orchestrator that would have silently
  discarded concurrent builders' results, a gate-policy inconsistency, and a
  Git worktree concurrency hazard — none of which a simulated orchestrator
  would have surfaced.
- `--dry-run` is genuinely useful rather than a stub: worktrees are created,
  files change, the project's real commands run, real diffs are computed. Only
  model calls and remote pushes are withheld.

## Consequences

- The mock writes real, presentation-only edits into the worktree so the
  protection gate has genuine content to evaluate.
- It synthesises per-operation shapes (distinct slugs, differing diversity
  vectors) so downstream assertions are meaningful rather than trivially
  satisfied.
- Integration tests are slower than unit tests — they run real Git and real
  npm scripts — but they test the thing that ships.
- Adding a new structured agent operation means adding a case to the mock;
  that is deliberate friction that keeps dry-run coverage complete.
