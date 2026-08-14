# ADR 001 — Claude Code CLI as the agent backend

**Status:** accepted

## Context

DesignLab needs to run three distinct model roles — a lead designer, parallel
builders, and an escalation reviewer — with file access, shell access, tool
restrictions, structured output and per-invocation budget limits.

Two options: embed an API client and build the agent loop, or drive the
locally installed Claude Code CLI in non-interactive mode.

## Decision

Drive the CLI, behind an `AgentRunner` interface.

```
claude --print --model <role model> --output-format json \
       --json-schema <schema> --append-system-prompt <role> \
       --allowedTools … --disallowedTools … --permission-mode … \
       --max-budget-usd …
```

## Rationale

- **Authentication is inherited.** DesignLab never handles a key. Whatever the
  operator's `claude` CLI can do, DesignLab can do.
- **Structured output is a flag.** `--json-schema` moves validation into the
  tool-call layer, so the model retries on a malformed response instead of
  DesignLab hand-rolling parse-and-retry.
- **Tool policy and budget are flags**, not something to reimplement.
- **The agent loop already exists**, is maintained, and improves without work
  here.
- **Model selection is an alias.** Roles map to `fable`/`sonnet`/`opus`, which
  the CLI resolves, so a new model release needs no DesignLab change.

## Consequences

- The CLI is a hard runtime dependency. `designlab doctor` checks for it, and
  `--dry-run` works without it.
- Output-envelope changes could break parsing, so the runner reads documented
  fields when present and falls back to raw stdout otherwise — a CLI upgrade
  degrades fidelity rather than breaking the pipeline.
- Prompts go over stdin, never argv, so they cannot appear in a process list.
- The `AgentRunner` interface keeps this reversible: an API-backed runner is a
  new implementation, not a rewrite.
