# Security boundaries

DesignLab runs autonomous agents with file-write and shell access against
somebody's working application. This documents what is contained, how, and
what is genuinely trusted.

---

## Blast radius

| Boundary | Enforcement |
| --- | --- |
| A builder can only write inside its own worktree | Worktree lease, verified before dispatch; `assertWithinLease` rejects outside paths |
| A builder cannot see or edit a sibling's work | Separate worktree directories; separate branches |
| Protected code cannot change | Deterministic Git diff after every attempt |
| The target base branch is never modified | Never checked out into a worktree; on the protected-branch list |
| Only DesignLab's own branches are pushed | `assertPushSafe` refuses protected branches and anything without the design prefix |
| Branches are never merged | The orchestrator has no merge path |
| Target repository hooks never execute | Every Git invocation runs with `core.hooksPath=/dev/null` |
| No interactive credential prompt can hang a round | `GIT_TERMINAL_PROMPT=0`, empty `GIT_ASKPASS` |
| Commands never go through a shell | `spawn` with `shell: false`; shell constructs are reported, not executed |
| Your own checkout is never touched | A local-path target is cloned into the workspace first |

---

## Credentials

- **Never written to state.** No token, key or password is persisted to
  `.designlab/`.
- **Never logged.** The logger redacts a known set of sensitive keys
  (`token`, `apiKey`, `password`, `secret`, `authorization`, …) recursively
  before rendering.
- **Never in a process list.** Agent prompts go to the CLI over stdin, not as
  argv.
- **Never echoed from errors.** GitHub API failures report status and status
  text only, not the response body, which can echo request headers on some
  error paths.
- **URLs are redacted** before logging if they carry an embedded credential.
- Authentication is delegated: Claude access comes from the CLI's own
  authentication, and Git access from the operator's existing Git credentials.

---

## What is actually trusted

Being precise about this matters more than a longer list of mitigations.

**Trusted:**

- The Claude Code CLI and its authentication.
- The operator's Git credentials.
- The target repository's own source code, to the extent that DesignLab runs
  its `typecheck`, `lint` and `test` commands. **Those commands execute
  arbitrary code from the target repository.** Only point DesignLab at
  repositories you would already run `npm test` on.

**Not trusted:**

- Model output. Every structured response is schema-validated before use.
  Every file change is diffed against the contract. Every claimed test result
  is re-run by DesignLab itself.
- Contract proposals from a model. Accepted only as tightenings; a proposed
  `DESIGNABLE` rule is discarded and the rejection recorded.
- Manifest enrichment from a model. It cannot overwrite build commands or
  framework detection, and cannot erase an evidence-backed capability or make
  a detected screen disappear.

---

## Agent permissions

Read-only stages (planning, review, escalation, enrichment, contract
classification) are dispatched with `Read`, `Glob`, `Grep` allowed and
`Edit`, `Write`, `Bash`, `NotebookEdit` denied.

Builder stages get `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash` — they must
change files and run tests — with `WebFetch` and `WebSearch` denied. The
containment for builders is the worktree lease and the protection diff, not
the tool list.

Agents run under `bypassPermissions` because unattended orchestration cannot
answer a prompt. That is a deliberate trade: the blast radius is bounded by
the worktree, the protection gate and the push guard rather than by
interactive approval.

---

## Failure posture

- Unknown paths default to `UNKNOWN`, not `DESIGNABLE`.
- An unreachable API leaves build state untouched rather than assuming
  failure.
- Corrupt state fails loudly with `STATE_CORRUPT` rather than being coerced.
- A candidate that throws is contained; its siblings continue.
- Cleanup removes local worktrees but never remote branches unless explicitly
  asked.

---

## Operator responsibilities

1. Point DesignLab only at repositories you control or have been given as a
   target.
2. Review the contract with `designlab protect` before the first round.
3. Scope `GITHUB_TOKEN` to the target repository, with `repo` and
   `actions:read`.
4. Review design branches before merging any of them. DesignLab deliberately
   never merges — that decision is yours.
