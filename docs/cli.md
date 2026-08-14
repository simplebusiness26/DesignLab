# CLI reference

All commands accept the global flags below. Human output goes to **stdout**;
structured logs go to **stderr**, so `--json` output is always safe to pipe.

## Global flags

| Flag | Meaning |
| --- | --- |
| `--cwd <dir>` | Directory to run in. Config and workspace resolve from here. |
| `--config <path>` | Path to `designlab.config.json`. |
| `--log-level <level>` | `debug`, `info`, `warn`, `error`, `silent`. |
| `--json` | Emit machine-readable JSON on stdout. |
| `--dry-run` | Run the full pipeline with the deterministic agent backend: no model calls, no pushes. |

`--dry-run` is not a simulation. Worktrees are created, files are changed,
the project's real verification commands run, and protection diffs are
computed. Only the model calls and the remote pushes are withheld.

---

## `designlab init`

Creates the workspace and configuration.

```bash
designlab init --repo https://github.com/you/app --branch main
```

| Flag | Meaning |
| --- | --- |
| `--repo <url>` | Default target repository. |
| `--branch <name>` | Default base branch. Defaults to `main`. |
| `--force` | Overwrite an existing config file. |

Writes `designlab.config.json`, creates `.designlab/`, and emits a JSON Schema
per persisted document into `.designlab/schemas/` so the state directory is
self-describing.

---

## `designlab inspect`

Analyses the target application and produces the App Manifest, a
human-readable analysis, and the Functionality Contract.

```bash
designlab inspect --repo https://github.com/you/app --branch main
```

| Flag | Meaning |
| --- | --- |
| `--repo <url\|path>` | Target repository URL or local path. |
| `--branch <name>` | Branch to analyse. |
| `--force` | Re-analyse even if this commit is already cached. |
| `--no-ai` | Deterministic analysis only; skip enrichment and contract proposal. |

**Caching.** The manifest is keyed by the exact commit SHA it describes.
Re-running against an unchanged commit is a no-op costing zero tokens, and is
recorded in the usage ledger as a cache hit. This is the single largest usage
control in the system.

**Local paths** are cloned into the workspace rather than operated on in
place, so DesignLab never creates branches or worktrees inside your own
checkout.

Detects: framework, package manager, Android build system, source structure,
screens, navigation, reusable components, theme surface, state management,
capabilities (auth, payments, location, messaging, database, storage, api,
analytics, camera, native modules), permissions, external hosts, tests, build
and lint commands, and existing CI.

---

## `designlab round`

Runs one complete design generation.

```bash
designlab round --designs 4 --diversity high
```

| Flag | Meaning |
| --- | --- |
| `--repo <url\|path>` | Target repository. |
| `--base <branch>` | Base branch. Ignored when evolving from a previous winner. |
| `--designs <n>` | Number of designs, 1–8. Default 4. |
| `--diversity <level>` | `low`, `medium`, `high`. Default `high`. |
| `--no-push` | Do not push successful branches. |
| `--write-workflow` | Commit the generated Actions workflow onto candidate branches even without pushing. |
| `--reference <path>` | Directory (or single image) of UI mockups; becomes an additional slot-A candidate. See [`reference-candidates.md`](reference-candidates.md). |

**Evolution.** If the previous round has a recorded winner and a saved
next-generation plan, this round automatically bases itself on the winner's
branch and commit rather than the original base branch. That is what makes
improvements compound across generations.

**Workflow delivery.** When pushing, the generated workflow is committed
onto each candidate branch as a marked, removable `[designlab-plumbing]`
commit — GitHub Actions only runs workflows present on the pushed ref. The
base branch is never touched. `--write-workflow` forces the same commit even
in a non-pushing or dry run, so you can inspect it.

---

## `designlab status`

```bash
designlab status --refresh
```

| Flag | Meaning |
| --- | --- |
| `--repo <url\|path>` | Target repository. |
| `--round <n>` | Show only this round. |
| `--refresh` | Re-read APK build state from the GitHub Actions API. |

`--refresh` needs `GITHUB_TOKEN` (or `GH_TOKEN`) and a GitHub-hosted target.
Without them, the command says so rather than reporting stale state as fresh.

Build states: `BUILD_NOT_REQUESTED`, `BUILD_PENDING`, `BUILD_RUNNING`,
`BUILD_SUCCESS`, `BUILD_FAILED`, `BUILD_UNSUPPORTED`. `BUILD_SUCCESS` is
reported only when the Actions API returns a real, unexpired artifact.

Also prints the usage summary: calls by role, calls by model, cache hits, and
cost when the backend reports it.

---

## `designlab choose`

Records the winner and plans the next generation.

```bash
designlab choose 1 C --feedback "C wins overall. I prefer A's map and B's profile."
```

| Argument / flag | Meaning |
| --- | --- |
| `<round>` | `1`, `r001`, or `round-1`. |
| `<candidate>` | Candidate letter, e.g. `C`. |
| `-f, --feedback <text>` | Why it won, and what to take from the others. |
| `--designs <n>` | Designs to plan for the next round. |
| `--no-plan` | Record the winner without planning the next generation. |

Feedback is parsed deterministically for sibling references — `A's map`,
`the profile from B` — and those borrowings become recorded requirements in the
next-generation plan rather than something a model might forget.

A candidate can only win if it has a committed implementation and did not
fail; otherwise it would poison the next generation's base commit.

---

## `designlab merge-check`

Verifies a candidate branch is ready for a **human** merge; never merges.

```bash
designlab merge-check 1 C
```

| Flag | Meaning |
| --- | --- |
| `--repo <url\|path>` | Target repository. |
| `--base <branch>` | Merge target (defaults to the round's base branch). |

Checks that temporary engine commits (identity overlay, build workflow) are
peelable from the tip, that the design content re-passes the Functionality
Contract against the *current* base, and that the merge is conflict-free
(`git merge-tree`). Prints `MERGE_READY` with exact merge commands, or
`NOT_MERGE_READY` with every blocker (exit 8). See
[`merge-and-identity.md`](merge-and-identity.md).

---

## `designlab protect`

```bash
designlab protect                                   # show the whole contract
designlab protect --path src/api/client.ts src/theme/theme.ts
designlab protect --branch design/r001-a-immersive --base main
```

| Flag | Meaning |
| --- | --- |
| `--path <path...>` | Classify these repository-relative paths. |
| `--branch <name>` | Check this branch's diff against the contract. |
| `--base <ref>` | Base ref for the branch check. |

Exits `6` when a branch check finds violations, so it is usable as a CI gate.

---

## `designlab workflow`

```bash
designlab workflow            # print the workflow DesignLab would use
designlab workflow --write    # write it into the working clone
```

Reports one of three strategies: `reuse-existing` (the target already builds
Android artifacts), `generated` (DesignLab produced the smallest workflow for
the detected stack), or `unsupported` (neither is possible — stated plainly
rather than pretended).

---

## `designlab clean`

```bash
designlab clean
designlab clean --delete-branches
```

Removes local worktrees. Local design branches are **kept** by default,
because a pushed design branch is a permanent artifact and silently deleting
its local counterpart would surprise you. Remote branches are never touched.

---

## `designlab doctor`

Checks git version and worktree support, Node version, the Claude CLI and its
authentication, configured model roles, the workspace, the config file, the
GitHub token, and known projects. Exits `1` if anything required is missing.

---

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unknown or internal error |
| 2 | Configuration missing or invalid |
| 3 | State file corrupt |
| 4 | Git failure, or an unsafe Git operation refused |
| 5 | Manifest or contract missing |
| 6 | Functionality contract violation |
| 7 | Agent failed, unavailable, or returned invalid output |
| 8 | Verification gate failed |
| 9 | Round or candidate not found |
| 10 | Android build system unsupported |
| 11 | Not implemented |
| 12 | Usage limit reached |
