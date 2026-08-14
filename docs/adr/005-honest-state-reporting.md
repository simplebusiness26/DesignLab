# ADR 005 — Every reported state is derived from evidence

**Status:** accepted

## Context

A system that runs tests, builds APKs and reports results has many
opportunities to be optimistic: treat a missing test command as a pass, treat
a pushed branch as a build, treat a green workflow as an APK. Each shortcut is
individually defensible and collectively makes the system's output worthless.

## Decision

No state is ever inferred optimistically. Every reported outcome traces to
evidence.

## Rationale and mechanics

**Gates.** A gate is `passed` only if its command actually ran and exited
zero. A gate with no configured command is `not-configured`. A gate skipped
because an earlier one failed is `skipped`. `didAllRequiredGatesPass` treats
`skipped` as failure by construction, so it cannot return true for a candidate
whose tests never executed.

**Advisory gates.** `dependencies`, `lint` and `build` are advisory: recorded
and surfaced, but not decisive. The set is a single exported constant consulted
by both `runGates` and `didAllRequiredGatesPass`, so "the run passed" and "the
candidate is acceptable" cannot disagree. That consistency bug existed during
development and was caught by an integration test.

**Builds.** `BUILD_SUCCESS` requires a completed successful workflow run *and*
a real, unexpired artifact from the Actions API. A run that succeeds but
uploads nothing is `BUILD_FAILED` — a green tick is not an APK. Runs for a
different commit are ignored, so a stale success cannot be reported as this
commit's success.

**Outages are not failures.** An unreachable GitHub API leaves build state
untouched with an explanatory note.

**Shell commands.** A configured command containing shell constructs is
reported as `not-configured` with a reason, rather than being silently marked
as passing.

**Model claims.** A builder's self-report is context, never evidence.
DesignLab re-runs every check itself.

## Consequences

- Output is sometimes less flattering: `not-configured` appears where a less
  careful system would print a tick.
- Callers must distinguish four gate statuses rather than a boolean.
- Cost and token fields are `null` when the backend does not report them,
  rather than estimated.
