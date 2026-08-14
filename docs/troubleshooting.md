# Troubleshooting

Start with `designlab doctor` — it checks git, Node, the Claude CLI and its
authentication, the workspace, the config file, and the GitHub token.

---

## Setup

### `Agent backend "claude-code" is not available`

The `claude` binary is missing or not runnable.

```bash
claude --version          # is it installed?
claude auth               # is it authenticated?
export DESIGNLAB_CLAUDE_BIN=/path/to/claude
designlab round --dry-run # works without the CLI entirely
```

### `No target repository specified`

Pass `--repo`, or set `repo` in `designlab.config.json` (`designlab init`).

### `Branch "X" was not found in the target repository`

Check the name. DesignLab tries `refs/remotes/origin/X`, then `refs/heads/X`,
then `X`. If the clone is stale, delete `.designlab/workspace/` and re-run —
it is disposable.

---

## Inspection

### The framework is detected as `unknown`

DesignLab found no recognised markers (`package.json` deps, `pubspec.yaml`,
Gradle + `AndroidManifest.xml`). Rounds still run, but commands and build
strategy will be missing. Add explicit commands to the target's `package.json`
(`typecheck`, `lint`, `test`) and re-inspect.

### `the repository scan hit its file cap`

The manifest is marked `truncated` and the analysis may be partial. Usually a
vendored dependency tree that is not in the default ignore list.

### Screens are missing or wrongly named

Discovery is heuristic — there is no universal definition of a "screen" across
React Native, Expo Router, Flutter and native Android. Every screen carries the
path it came from so you can check the analyser's work. The AI enrichment pass
improves names; it cannot delete a detected screen.

### Inspect keeps re-running the AI pass

It should not: manifests are cached by commit SHA. If the commit changed, that
is correct behaviour. Use `--no-ai` for deterministic analysis only.

---

## Rounds

### `The design set scored 0.42, below the required 0.55`

The lead agent produced designs that are too similar. DesignLab re-plans with
the colliding pair named. If it still falls short after
`limits.diversityRetries`, it proceeds with the best set and reports
`belowDiversityTarget`.

Options: raise `diversityRetries`, lower `minDiversityScore` if you are
deliberately refining rather than exploring, or run with
`--diversity high`.

### A candidate is `rejected` with protection violations

The design touched a `PROTECTED` or `RESTRICTED` path. Inspect it:

```bash
designlab protect --branch design/r001-a-immersive --base main
```

If the rule is genuinely wrong for your project, add an approved exception or
a project rule — user rules always win:

```json
{
  "protection": {
    "approvedExceptions": [
      { "pattern": "src/auth/LoginCopy.ts", "reason": "Presentation copy only." }
    ]
  }
}
```

### A candidate is `gates-failed`

Look at the recorded output:

```bash
designlab status --round 1 --json | jq '.rounds[0].candidates[] | {slot, failure, gates}'
```

Each gate records its command, exit code and a trimmed tail of failing output.
Builder transcripts are under
`.designlab/state/projects/<id>/rounds/<round>/logs/<slot>/`.

### Every candidate fails typecheck or test

Usually the target's dependencies are not installed in the worktrees. The
`dependencies` gate is advisory, so a failing `npm ci` is recorded but does not
by itself sink a candidate — the required gates then fail for the real reason.

Check that the detected `install` command works in a fresh checkout.

### `Command requires a shell`

A configured command contains `&&`, `|`, `;` or similar. DesignLab never runs
commands through a shell, so it reports `not-configured` rather than pretending
to pass. Move that command into CI, or replace it with a package script that
does not need a shell.

### `Worktree directory … is already checked out on "…"`

A previous round left state behind.

```bash
designlab clean
```

### A round is slow

Each candidate runs the project's real verification commands in its own
worktree. Lower `limits.concurrency` if you are I/O bound, or raise it if you
have headroom. Timeouts are configurable per stage.

---

## Builds

### Every build is `BUILD_NOT_REQUESTED`

Branches were not pushed. Either it was a dry run, `--no-push` was passed,
`build.pushBranches` is `false`, or the candidate did not reach `ready`.

### Build state never leaves `BUILD_PENDING`

```bash
designlab status --refresh
```

Needs `GITHUB_TOKEN` and a GitHub-hosted target. If the workflow does not
exist on the design branch, write it:

```bash
designlab workflow --write
# or
designlab round --write-workflow
```

### `BUILD_FAILED` with "succeeded but produced no artifact"

The workflow ran and passed, but uploaded no APK. A green tick is not an APK.
Check that the build step actually produces one and that the upload step's
path matches.

### `BUILD_UNSUPPORTED`

No Android build strategy fits the detected stack. Add an Android workflow to
the target repository, then re-inspect — DesignLab prefers reusing your own.

---

## Choosing

### `Candidate C has no committed implementation`

Only a candidate that produced commits can become the parent of the next
generation. Choose one that reached `ready` or `pushed`.

### `Candidate A failed and cannot be chosen`

Same reason: it would poison the next generation's base commit.

### My feedback's borrowings were not picked up

Parsing needs a possessive or an explicit `from X`: `A's map`, `the map from
A`. A bare capital letter in prose is deliberately ignored so ordinary
sentences do not create phantom borrowings.

```bash
designlab choose 1 C --feedback "…" --json | jq '.borrowings'
```

---

## State

### `State file failed validation`

The file was written by an incompatible version or edited by hand. The error
names the file and the failing field. Delete it and re-run the command that
produced it; `.designlab/workspace/` is always safe to delete.

### Everything is confusing and I want a clean start

```bash
designlab clean
rm -rf .designlab/workspace   # disposable: clones and worktrees
# rm -rf .designlab/state     # destructive: discards round history and lineage
```
