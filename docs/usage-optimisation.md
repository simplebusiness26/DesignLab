# Usage optimisation

Claude usage efficiency is a product requirement, not an afterthought. This
documents where the tokens go and what bounds them.

The governing rule: **never sacrifice correctness to save tokens.** Everything
below saves work that did not need doing, rather than skipping work that did.

---

## Where model calls happen

| Stage | Role | Model | Frequency |
| --- | --- | --- | --- |
| Manifest enrichment | lead | Fable | Once per **new commit**, cached |
| Contract classification | lead | Fable | Once per **new commit**, cached |
| Round planning | lead | Fable | Once per round (+1 per diversity re-plan) |
| Implementation | builder | Sonnet | Once per candidate, plus retries |
| Escalation | reviewer | Opus | Only after a builder failed a retry |
| Design review | lead | Fable | Once per surviving candidate |
| Revision | builder | Sonnet | Only for a `revise` verdict |
| Next-generation plan | lead | Fable | Once per `choose` |

Everything else — Git, worktrees, diffing, protection, gate execution,
workflow generation, build polling, status — is deterministic software.

---

## The controls

### 1. Analyse an unchanged repository once

The App Manifest is keyed by the exact commit SHA it describes. Re-running
`designlab inspect` against an unchanged commit is a no-op costing **zero
tokens**, recorded in the ledger as a cache hit. This is the single largest
saving, since inspection is otherwise the most expensive read of the codebase.

### 2. Send workers focused context

A builder receives its own brief, the App Manifest, the Functionality Contract,
the verification commands, and its worktree path. It does **not** receive the
round strategy, its siblings' briefs, or any orchestration history.

That is a cost control and a correctness control at once: cross-contamination
between candidates is exactly how four designs converge into one.

Manifest rendering is bounded — screens capped, components capped, the full
JSON never pasted in.

### 3. Use the cheapest model that can do the job

Fable is reserved for judgment: strategy, design generation, creative review,
evolution. Sonnet does the routine engineering, which is most of the calls.
Opus is escalation-only.

### 4. Never escalate speculatively

Opus requires: a retry already spent, a retry remaining, and a non-protection
failure. Most builder failures are ordinary and Sonnet fixes them from the
gate output alone.

### 5. Retry ceilings

`builderAttempts` and `escalations` are hard limits. A pathological design
cannot consume unbounded budget. `maxBudgetUsdPerAgent` adds a per-invocation
spend cap enforced by the CLI itself.

### 6. Return only the weak candidate to its builder

A `revise` verdict re-invokes **that candidate's** builder with specific
corrections. DesignLab never rebuilds a whole round because one design was
weak.

### 7. No models during compilation

Gradle and GitHub Actions waits involve no model reasoning. Build polling is
plain HTTP.

### 8. Avoid repeated full-repo scans

Inspection walks the tree once with bounded depth and file count, reads only
files matching interest patterns, and skips `node_modules`, `.git`, build
output and vendor directories. Read-only agent stages get `Read`/`Glob`/`Grep`
and are denied `Edit`/`Write`/`Bash`.

---

## Measuring

Every agent invocation is appended to `.designlab/usage.jsonl`:

```jsonc
{
  "ts": "2026-08-14T10:00:00.000Z",
  "projectId": "you-app-1a2b3c4d",
  "round": 1,
  "slot": "A",
  "role": "builder",
  "model": "sonnet",
  "operation": "implement-design",
  "durationMs": 84213,
  "ok": true,
  "costUsd": 0.42,
  "inputTokens": 18400,
  "outputTokens": 3100,
  "numTurns": 12,
  "cacheHit": false
}
```

```bash
designlab status    # calls by role, calls by model, cache hits, cost, failures
```

Cost and token fields are populated when the backend reports them; when it
does not, they are `null` rather than estimated.

---

## Rehearsing for free

```bash
designlab round --designs 4 --dry-run
```

Runs the entire pipeline — worktrees, file changes, real verification
commands, real protection diffs — with the deterministic agent backend and no
pushes. Use it to validate configuration, protection rules and gate commands
before spending anything.

---

## Rough cost shape

For a four-design round, model calls are approximately:

- 1 planning call (Fable), plus one more if diversity falls short
- 4 implementation calls (Sonnet), plus retries only where gates fail
- 0–1 escalations (Opus), only for candidates that failed twice
- 4 review calls (Fable), one per surviving candidate
- 0–N revision calls (Sonnet), only for `revise` verdicts

Inspection adds two Fable calls on a new commit and zero on a cached one.
Builder calls dominate, which is why they are the cheapest capable model and
receive the narrowest context.
