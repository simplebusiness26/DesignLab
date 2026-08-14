# Configuration

`designlab.config.json` lives beside your workspace and is created by
`designlab init`.

Resolution order, later wins:

```
built-in defaults → designlab.config.json → environment → CLI flags
```

---

## Full reference

```jsonc
{
  "$schema": "./.designlab/schemas/config.schema.json",

  // Workspace root. Relative paths resolve against the config file's directory.
  "workspaceDir": ".designlab",

  // Default target. Overridable with --repo / --branch.
  "repo": "https://github.com/you/your-app",
  "branch": "main",

  // Git branch prefix for design candidates. Also the push guard's allowlist.
  "branchPrefix": "design",

  // Roles map to models. Aliases are resolved by the Claude CLI, so a new
  // model release needs no config change. Full model ids also work.
  "models": {
    "lead": "fable",      // strategy, briefs, review, evolution
    "builder": "sonnet",  // implementation
    "reviewer": "opus"    // escalation only
  },

  "limits": {
    "builderAttempts": 2,          // implementation attempts per candidate
    "escalations": 1,              // Opus escalations per candidate
    "concurrency": 2,              // candidates implemented in parallel
    "builderTimeoutMs": 2700000,   // 45 min per builder invocation
    "leadTimeoutMs": 900000,       // 15 min per lead/reviewer invocation
    "gateTimeoutMs": 1200000,      // 20 min per verification command
    "maxBudgetUsdPerAgent": null,  // per-invocation spend cap, or null
    "minDiversityScore": 0.55,     // below this, the plan is rejected
    "diversityRetries": 1          // re-plans allowed before proceeding
  },

  "protection": {
    "rules": [],               // project rules; always win over built-ins
    "approvedExceptions": [],  // waive a rule for a specific path, with a reason
    "failOnUnknown": false,    // fail a candidate that touches unclassified paths
    "failOnRestricted": true,  // fail a candidate that touches RESTRICTED paths
    "maxChangedFiles": 400     // a runaway diff is a red flag in itself
  },

  "build": {
    "generateWorkflow": true,      // emit a workflow when the target lacks one
    "reuseExistingWorkflow": true, // prefer the target's own Android workflow
    "workflowPath": ".github/workflows/designlab-android.yml",
    "pushBranches": true,          // push successful design branches
    "remote": "origin"
  },

  // "claude-code" drives the real CLI. "mock" runs the whole pipeline
  // deterministically with no model calls — same backend as --dry-run.
  "agentRunner": "claude-code",
  "claudeBin": "claude",

  // Enrich the deterministic manifest with an AI analysis pass.
  "aiManifestEnrichment": true,

  "logLevel": "info",
  "logFormat": "human"
}
```

---

## Environment variables

| Variable | Effect |
| --- | --- |
| `DESIGNLAB_LOG_LEVEL` | Overrides `logLevel` |
| `DESIGNLAB_CLAUDE_BIN` | Overrides `claudeBin` |
| `DESIGNLAB_AGENT_RUNNER` | `claude-code` or `mock` |
| `DESIGNLAB_NO_COLOR` | Forces plain log output |
| `GITHUB_TOKEN` / `GH_TOKEN` | Reading APK build state; pushing |
| `ANTHROPIC_API_KEY` | Only if you want the CLI under API-key auth |

Credentials are never written to state files, and the logger redacts a
known set of sensitive keys before rendering any record.

---

## Tuning notes

**`limits.concurrency`** — each candidate is a full worktree running the
project's real typecheck/lint/test commands. Raising this multiplies disk and
CPU use. 2–4 is sensible; 8 is the ceiling.

**`limits.builderAttempts`** and **`escalations`** — the retry ceiling exists
to prevent uncontrolled usage loops. `builderAttempts: 2, escalations: 1`
means at most two Sonnet invocations plus one Opus diagnosis per candidate.
Escalation cannot occur on a first failure by construction.

**`limits.minDiversityScore`** — raise toward `0.7` for genuinely radical
exploration; lower toward `0.4` when refining a direction that already works.
Falling short is reported, never hidden.

**`protection.failOnRestricted`** — set `false` when your project keeps
presentation and behaviour in shared files and the default is too strict. The
violations are still recorded either way.

**`protection.failOnUnknown`** — set `true` for maximum strictness on a
well-mapped codebase. On an unfamiliar one it produces noise.

**`build.pushBranches`** — set `false` to evaluate designs locally without
touching the remote at all.

---

## Minimal configuration

Most projects need only:

```json
{
  "repo": "https://github.com/you/your-app",
  "branch": "main"
}
```
