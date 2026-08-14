# Architectural decision records

Short records of decisions that were not obvious, and that a future maintainer
would otherwise be tempted to reverse without knowing why they were made.

| # | Decision |
| --- | --- |
| [001](001-claude-code-cli-as-agent-backend.md) | Drive models through the Claude Code CLI, not a bespoke API client |
| [002](002-deterministic-protection-over-prompts.md) | Enforce the functionality contract with a Git diff, not with instructions |
| [003](003-worktrees-for-candidate-isolation.md) | Use Git worktrees, not clones or sequential checkouts |
| [004](004-measured-diversity.md) | Measure design diversity numerically and re-plan on collision |
| [005](005-honest-state-reporting.md) | Derive every reported state from evidence |
| [006](006-deterministic-runner-for-tests-and-dry-run.md) | One deterministic runner serves both tests and `--dry-run` |
