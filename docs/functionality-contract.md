# The Functionality Contract

> **Functionality is frozen. Design is flexible.**

The contract is the boundary between what a redesign may touch and what it may
not. It is the single most important safety mechanism in DesignLab, so it is
enforced by a deterministic Git diff rather than by instructions to a model.
An agent that modifies a protected file fails the gate regardless of how
convincingly it explains itself.

---

## Levels

| Level | Meaning | Effect |
| --- | --- | --- |
| `PROTECTED` | Behaviour that must be preserved exactly | Any change fails the candidate |
| `RESTRICTED` | May be touched, but must be justified | Fails by default; configurable |
| `DESIGNABLE` | The subject of the experiment | Free to change |
| `UNKNOWN` | No rule matched | Recorded; fails only if `failOnUnknown` |

---

## How the contract is built

Three layers, in increasing priority.

### 1. Built-in rules

Universally dangerous or universally designable surfaces, applied to every
project.

**PROTECTED** — migrations, `*.sql`, `schema.prisma`, lock files, GitHub
workflows, `.env*`, service credential files, `AndroidManifest.xml`,
`Info.plist`.

**RESTRICTED** — `build.gradle`, `settings.gradle`, `gradle.properties`,
`package.json`, `pubspec.yaml`, app/EAS config, toolchain config, and tests.

Tests are RESTRICTED rather than PROTECTED on purpose: a redesign legitimately
needs to update a snapshot, but must never delete a failing assertion. The
distinction is enforced by the `no-test-weakening` invariant plus review.

**DESIGNABLE** — theme/token/style directories, components, screens, assets,
image and font files, Android resource directories.

### 2. Capability-derived rules

Applied only where the manifest found real evidence. A project without
payments is not burdened with a payments rule, and a rule nobody can justify
is a rule nobody will trust.

| Capability | Adds |
| --- | --- |
| `auth` | `**/{auth,authentication,session}/**` PROTECTED; auth screens RESTRICTED |
| `payments` | `**/{payment,billing,checkout,subscription}/**` PROTECTED |
| `database` | `**/{db,database,models,entities}/**` PROTECTED |
| `api` | `**/{api,services,network,http,graphql}/**` PROTECTED |
| `location` | location logic PROTECTED; map presentation RESTRICTED |
| `messaging` | delivery PROTECTED; chat presentation RESTRICTED |
| `storage` | persistence PROTECTED |
| `analytics` | RESTRICTED — event names are a data contract |
| `native-modules` | native bridge code PROTECTED |

For `auth`, `payments` and `database`, the concrete files that produced the
evidence are also protected individually — a rule with a real path behind it
is harder to argue with than a pattern.

### 3. User rules

From `designlab.config.json`. **Always win**, even over a more specific
built-in, because you know your codebase and DesignLab does not.

```json
{
  "protection": {
    "rules": [
      { "pattern": "src/pricing/**", "level": "PROTECTED", "reason": "Pricing rules are contractual." },
      { "pattern": "src/legacy/**", "level": "RESTRICTED", "reason": "Fragile; touch only if the brief needs it." }
    ],
    "approvedExceptions": [
      { "pattern": "src/auth/LoginCopy.ts", "reason": "Presentation copy only, no auth logic." }
    ],
    "failOnUnknown": false,
    "failOnRestricted": true,
    "maxChangedFiles": 400
  }
}
```

### Agent proposals

An optional Fable pass may propose additional rules. Proposals are accepted
**only as tightenings** — `PROTECTED` or `RESTRICTED`. A proposed `DESIGNABLE`
rule is discarded and the rejection is recorded in the contract's notes. A
model may make DesignLab more careful; it may never make it less careful.

---

## Rule resolution

When several rules match a path:

1. **Source priority** wins first: user > detected > built-in.
2. Within one source, the **more specific** pattern wins
   (`src/api/payments/**` beats `src/**`).
3. A genuine tie resolves to the **stricter** level.

---

## Glob syntax

Implemented in `src/protection/glob.ts` rather than taken from a dependency,
because the exact semantics decide whether designs are accepted or rejected
and must be testable and stable.

| Pattern | Matches |
| --- | --- |
| `*` | Any run of characters except `/` |
| `**` | Any run of characters including `/` |
| `?` | Exactly one character except `/` |
| `{a,b}` | Alternation, nestable |
| `[abc]`, `[!abc]` | Character class, negatable |
| `dir/` | The directory and everything under it |

`a/**/b` also matches `a/b`. Matching is case-sensitive, against
repository-relative POSIX paths.

---

## What the gate checks

For each file changed between the round's base commit and the candidate's
head:

- **Renames are checked against both paths.** A protected file cannot be
  laundered by moving it.
- **Deletions count.** Removing a protected file is a change to it.
- **Approved exceptions** waive a rule, and the waiver is recorded in the
  report for audit.
- **Change-set size** is bounded by `maxChangedFiles`. A diff far larger than
  any redesign needs is usually a reformat, a dependency reinstall, or a lost
  worktree — and is a violation in itself.

---

## Behavioural invariants

Alongside path rules, the contract records invariants that must still hold
after any redesign. Two are always present:

- Every user-visible flow must produce the same outcome as before.
- No existing test may be deleted, skipped, or have an assertion relaxed.

Capability-specific invariants are added where relevant: the auth boundary,
payment amounts and confirmation steps, location permission ordering, message
delivery semantics, and forward-compatibility of persisted data.

Invariants are given to builders and reviewers as context. Unlike path rules
they are not mechanically checkable, which is precisely why the path rules
carry the enforcement burden.

---

## Inspecting and testing the contract

```bash
designlab protect                                    # the whole contract
designlab protect --path src/api/client.ts           # classify one path
designlab protect --branch design/r001-a --base main # check a branch (exit 6 on violation)
```
