# ADR 003 — Git worktrees for candidate isolation

**Status:** accepted

## Context

Several builders must work simultaneously on competing designs of the same
application, each starting from an identical base commit, without seeing or
corrupting each other's work.

Options: sequential checkouts in one clone; a full clone per candidate; Git
worktrees.

## Decision

One Git worktree per candidate, all created from the same base commit, under a
project-scoped worktrees root.

## Rationale

- **Sequential checkouts** serialise the round and make parallelism
  impossible — the main cost saving of running four designs at once.
- **Full clones** duplicate the entire object database per candidate. On a
  real mobile repository that is gigabytes, repeated every round.
- **Worktrees** share one object database and give each candidate a genuinely
  separate working directory and branch. Creation is fast and the isolation is
  enforced by Git itself.

## Consequences

- The base branch is never checked out into a worktree, so it cannot be
  modified by a builder.
- Each builder receives a **lease** naming exactly one directory, re-verified
  immediately before dispatch. `assertWithinLease` rejects paths outside it.
- Worktrees are disposable: `.designlab/workspace/` can be deleted at any time
  and is rebuilt on demand.
- `git worktree add`/`remove` mutate shared metadata under `.git/worktrees/`
  and Git does not lock that directory against itself. Concurrent calls fail
  with errors as opaque as "failed to read .git/worktrees/<other>/commondir",
  so `WorktreeManager` serialises its own mutations internally. Callers may fan
  out freely; an integration test pins this.
- Cleanup removes worktrees but keeps local branches by default, because a
  pushed design branch is a permanent artifact.
