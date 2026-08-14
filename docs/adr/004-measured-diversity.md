# ADR 004 — Measure design diversity numerically

**Status:** accepted

## Context

The central product risk: a model asked for four designs produces one design
in four colourways. If that happens, the human evaluates four versions of the
same idea, four APKs are built for nothing, and the whole exercise degrades
into an expensive theme picker.

"Make them different" in a prompt does not reliably prevent this, and nothing
downstream would notice if it failed.

## Decision

Require every design to declare a position on thirteen dimensions. Score the
round as the mean pairwise distance across those positions. Reject and re-plan
below a configurable threshold, naming the specific collision.

## Rationale

- **Measurable beats aspirational.** A threshold either passes or does not.
- **The dimensions force structural thinking.** A model that must state a
  position on information hierarchy, navigation presentation, density and
  interaction model cannot get away with "modern and clean."
- **The feedback is actionable.** "Designs B and C take the same position on
  navigationPresentation, density and interactionModel; rewrite one to differ
  structurally on at least three" is a correction. "Be more different" is not.
- **It degrades visibly.** After the retry ceiling, DesignLab proceeds with the
  best set and records `belowDiversityTarget` rather than silently shipping a
  homogeneous round.

## Consequences

- Similarity uses token-overlap (Jaccard over normalised word sets), which is
  deliberately simple and dependency-free. The goal is catching "these two say
  the same thing", not modelling semantics.
- Positions must be written as concrete decisions for the scoring to mean
  anything; the prompt says so explicitly, and adjective-only vectors score as
  collisions.
- The threshold is configurable: raise it for radical exploration, lower it
  when deliberately refining a direction that already works.
- A unit test encodes the failure mode directly — four designs differing only
  in palette must score below 0.2 and flag every structural dimension as
  converged.
