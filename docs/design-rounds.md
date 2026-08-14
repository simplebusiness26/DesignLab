# Design rounds

A round is one generation: N design directions, implemented in parallel,
verified, reviewed, and reported honestly.

```bash
designlab round --designs 4 --diversity high
```

---

## 1. Planning, and the diversity problem

The central product risk is that a model asked for four designs produces one
design in four colourways. DesignLab makes that measurable instead of a matter
of taste.

Each design declares a position on **thirteen dimensions**:

| | | |
| --- | --- | --- |
| information hierarchy | navigation presentation | density |
| screen composition | interaction model | visual language |
| content emphasis | spatial model | typography |
| component shape | motion | discoverability |
| one-handed usage | | |

Designs are compared dimension by dimension using token-overlap similarity.
The round's score is the mean pairwise **distance** — 0 is identical, 1 is
fully distinct. Below `limits.minDiversityScore` (default `0.55`), the plan
goes back to the lead agent with:

- the closest pair, named;
- the dimensions on which they take effectively the same position;
- the dimensions on which the whole set has converged.

That is a correction, not a re-roll. After `limits.diversityRetries` attempts,
DesignLab proceeds with the most diverse set it obtained and records
`belowDiversityTarget` in the result — degrading visibly rather than silently.

### Diversity levels

| Level | Requirement |
| --- | --- |
| `low` | May share structure; differ mainly in visual treatment and density |
| `medium` | Differ in ≥4 dimensions, including hierarchy or navigation |
| `high` | Structurally different systems; distinct on hierarchy, navigation, density and interaction model |

---

## 2. Briefs

Each design becomes a permanent, structured Design Brief:

| Field | Purpose |
| --- | --- |
| `slug`, `name` | Identity, used in branch names and APK filenames |
| `thesis` | One line stating the design's point of view |
| `rationale` | Who it serves and why it might win |
| `diversityVector` | Position on all thirteen dimensions |
| `directives` | Concrete instructions (3–40), executable without asking a question |
| `targetScreens` | Screens that must visibly change |
| `antiPatterns` | What this design must deliberately *not* do — keeps designs apart |
| `successCriteria` | What a reviewer should be able to observe |
| `parent` | Lineage, when evolved from a previous winner |

Briefs are saved under `.designlab/state/projects/<id>/rounds/<round>/briefs/`
and never rewritten.

---

## 3. Isolation

Every candidate gets its own branch and worktree, all rooted at the **same**
base commit:

```
design/r001-a-immersive   → .designlab/workspace/<project>/worktrees/r001-a-immersive
design/r001-b-social      → …/r001-b-social
design/r001-c-premium     → …/r001-c-premium
design/r001-d-utility     → …/r001-d-utility
```

The base branch is never checked out, modified or force-pushed. Design
branches are never merged — the orchestrator has no merge path.

---

## 4. Implementation

Builders run at `limits.concurrency` in parallel. Each receives only:

- its own Design Brief,
- the App Manifest,
- the Functionality Contract,
- the project's verification commands,
- its worktree path.

Not the round strategy, not sibling briefs, not the orchestrator's
conversation. That keeps context cost bounded and prevents designs from
converging by contamination.

---

## 5. Verification gates

```
dependencies → typecheck → lint → test → protection → build
```

Three rules make the result trustworthy:

1. A gate is `passed` **only** if its command actually ran and exited zero.
2. A gate with no configured command is `not-configured`, never `passed`.
3. A gate skipped because an earlier one failed is `skipped`, never `passed`.

Consequently `didAllRequiredGatesPass` cannot return true for a candidate
whose tests never executed.

### Required vs advisory

| Gate | Class | Rationale |
| --- | --- | --- |
| `typecheck` | required | A design that does not compile is not a design |
| `test` | required | Behaviour preservation is the whole point |
| `protection` | required, always run | DesignLab runs this itself; its absence means the pipeline did not complete |
| `dependencies` | advisory | A project may have no lockfile or install offline; if deps are genuinely broken, the required gates fail anyway |
| `lint` | advisory | Many real repositories carry pre-existing lint debt |
| `build` | advisory | Expensive; delegated to GitHub Actions |

Advisory results are always recorded and surfaced — they simply do not sink a
candidate on their own. The set lives in one constant consulted by both
`runGates` and `didAllRequiredGatesPass`, so "the run passed" and "the
candidate is acceptable" can never disagree.

Commands containing shell constructs (`cd android && …`) are reported as
`not-configured` with an explanation, because DesignLab never runs commands
through a shell. They belong in CI.

Each gate records its command, exit code, duration, and a trimmed tail of
failing output — never megabytes of build noise.

---

## 6. Retry and escalation

```
attempt 1 fails
  → Sonnet retries with the exact gate output
attempt 2 fails, a retry remains, and it was not a protection failure
  → Opus diagnoses (read-only)
  → Sonnet applies the diagnosis
attempts exhausted
  → candidate marked gates-failed or rejected, with the reason recorded
```

Opus is never invoked speculatively or on a first failure. Protection failures
never escalate — they are a design decision to reverse, not an engineering
puzzle. Ceilings are `limits.builderAttempts` and `limits.escalations`.

---

## 7. Design review

Engineering gates prove the code works. They say nothing about whether the
brief was honoured or whether the design is distinct — which is the point of
the exercise. Fable reviews each surviving candidate against its brief, the
diff, and its siblings' theses, scoring:

brief adherence · distinctiveness · internal consistency · functionality
preservation · usability · completeness · regression risk

| Verdict | Consequence |
| --- | --- |
| `accept` | Candidate is `ready` |
| `revise` | Corrections go back to **that candidate's own builder**; gates re-run |
| `reject` | Candidate is out — typically a minor variant of a sibling |

DesignLab never rebuilds a whole round because one design was weak.

---

## 8. Push and build

Successful candidates are pushed through `assertPushSafe`, which refuses
protected branches and anything not carrying the design prefix. GitHub Actions
then builds one APK per branch. See [`apk-pipeline.md`](apk-pipeline.md).

---

## Candidate states

| State | Meaning |
| --- | --- |
| `planned` | Brief exists, no worktree yet |
| `worktree-ready` | Isolated branch and worktree created |
| `implementing` | Builder is working |
| `gates-running` | Verification in progress |
| `gates-failed` | Verification failed after all attempts |
| `review-pending` | Gates passed; awaiting design review |
| `revising` | Applying review corrections |
| `rejected` | Failed protection, or rejected by review |
| `ready` | Passed everything |
| `pushed` | Branch pushed to the remote |
| `failed` | Unrecoverable error |
