# ADR 002 — Deterministic protection over prompt instructions

**Status:** accepted

## Context

DesignLab's core promise is that a redesign cannot change what an application
does. The obvious implementation is to tell the agents which files are
off-limits and trust them.

## Decision

Tell them, **and** verify with a deterministic Git diff after every attempt.
The Functionality Contract is a set of glob rules evaluated against the diff
between the round's base commit and the candidate's head. A violation fails
the candidate regardless of what the agent reports.

## Rationale

- An instruction is a probability, not a guarantee. This system runs many
  parallel agents against production applications; a 1% failure rate is a
  broken promise at scale.
- A diff is checkable, reviewable and testable. A prompt is none of those.
- It makes the guarantee explainable: a violation names the file, the rule and
  the reason, rather than "the model was told not to."
- It fails safe. An unknown path is `UNKNOWN`, not `DESIGNABLE`.

## Consequences

- The glob matcher is implemented in-repo rather than taken from a dependency,
  because its exact semantics decide acceptance and must be stable and
  testable.
- Renames are checked against both paths; a protected file cannot be laundered
  by moving it.
- Contract construction is layered — built-in, capability-derived, user — with
  user rules always winning, including over a more specific built-in.
- A model may **propose** rules but only as tightenings. A proposed
  `DESIGNABLE` rule is discarded and the rejection recorded. Models can make
  DesignLab more careful, never less.
- False positives are possible, so `approvedExceptions` exists — but each one
  requires a written reason and is recorded in the report.
