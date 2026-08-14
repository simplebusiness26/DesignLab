# Status and roadmap

Accurate as of V1. This page exists so that "what DesignLab does" and "what
DesignLab is documented to do" stay the same thing.

---

## Implemented and tested

Everything here is exercised by the test suite, including integration tests
that run the production orchestrator over real Git repositories.

| Area | State |
| --- | --- |
| CLI: `init`, `inspect`, `round`, `status`, `choose`, `protect`, `workflow`, `clean`, `doctor` | Working |
| `--dry-run` across the whole pipeline | Working |
| `--json` output on every command | Working |
| Repository inspection → App Manifest | Working; SHA-keyed cache |
| Framework detection: Expo, React Native, Flutter, native Android, KMP, Capacitor, Ionic, NativeScript | Working |
| Capability detection: auth, payments, location, messaging, database, storage, api, analytics, camera, native modules | Working, evidence-backed |
| Human-readable analysis document | Working |
| Functionality Contract: built-in + capability + user rules | Working |
| Deterministic protection gate over Git diffs | Working; renames, deletions, exceptions, size ceiling |
| Design round planning with diversity scoring and re-planning | Working |
| Worktree isolation, one base commit per round | Working; concurrency-safe |
| Parallel builders with bounded concurrency | Working |
| Verification gates with honest status semantics | Working |
| Retry and Opus escalation with hard ceilings | Working |
| Fable design review with accept/revise/reject | Working |
| Push guard | Working |
| Actions workflow generation: Gradle, Expo prebuild, EAS, Flutter, Capacitor | Working |
| Build state tracking from the Actions API | Working |
| Winner selection, feedback parsing, lineage | Working |
| Next-generation planning, with a deterministic fallback | Working |
| Usage ledger and reporting | Working |
| Device-installability assessment (`DEVICE_INSTALLABLE` vs `NOT_INSTALLABLE`) | Working; debug variant is the default |
| Generated workflow committed onto candidate branches (marked, removable) | Working |
| Opus escalation ladder reachable with default limits | Working; pinned by an integration test |
| Invariant guards: dependency removal, app identity, permissions | Working, inside the protection gate |
| Candidate identity overlay for side-by-side installs (opt-in, risk-gated) | Working |
| `merge-check`: engine-commit peeling, protection re-check, conflict check | Working |
| Semantic diversity judge (Fable, high-diversity rounds) | Working; lexical filter runs first |
| Reference-image candidates with origin-tracked lineage | Working (`round --reference <dir>`) |
| Interrupted rounds marked `aborted` on the next round start | Working |

---

## Verified against live models

`npm run live-smoke` makes real calls through DesignLab's own runner. It has
been run and passed, confirming:

- Role → model mapping (`fable` / `sonnet` / `opus`) resolves correctly.
- Structured output via `--json-schema` is returned and validates.
- Usage, cost and session id are extracted from the CLI envelope.
- **Fable meets the diversity requirement on a real request** — a three-design
  plan scored 0.913 against a 0.55 threshold.
- **Fable rejects a cosmetic change presented as a structural redesign** —
  given a theme-token-only diff against a density-focused brief, the verdict
  was `reject` with a correct explanation. This is the exact failure mode the
  review stage exists to catch.
- **Sonnet implements a brief in a real directory** and returns an honest
  structured report; the files were genuinely modified.
- **The semantic diversity judge catches conceptual collisions** — given two
  structurally identical designs described in disjoint vocabulary (which the
  lexical filter scores as diverse) plus one genuinely different design,
  Fable returned `collision` naming exactly the disguised pair and left the
  distinct design unflagged.

## Implemented but not yet exercised against a real Android app

Complete and tested, but not yet run against a live target repository with a
real GitHub Actions build. This is the next milestone, not a gap in the code.

- A full `designlab round` against a real mobile application repository.
- A real GitHub Actions run producing a downloadable APK.
- `designlab status --refresh` against a live Actions API.

---

## Known limitations

| Limitation | Detail |
| --- | --- |
| Screen discovery is heuristic | No universal definition of a "screen" across frameworks. Every screen records its source path so results are checkable. |
| Shell-construct commands are not executed | `cd android && ./gradlew …` is reported as `not-configured`. Such commands belong in CI. |
| Most behavioural invariants are not mechanically checked | Dependency removal, app identity and declared permissions ARE checked deterministically; the remainder are context for agents and reviewers. |
| Release builds are unsigned unless the target configures signing | The default is the debug variant, which is auto-signed and device-installable; `NOT_INSTALLABLE` is reported honestly for unsigned release builds. |
| Screen capture is an interface, not an implementation | Candidates record `captureStatus: "unsupported"`; review runs on code and diff evidence. A real adapter is purely additive. |
| Identity overlay disables identity-bound integrations in candidate builds | Firebase/OAuth/Maps/app-links will not work under a suffixed applicationId; the overlay refuses by default when those markers are detected. |
| Single target repository per project | Monorepos with several apps need one DesignLab project per app. |
| GitHub Actions only | The `ActionsClient` interface makes another CI provider a new implementation, not a rewrite. |
| Lexical diversity scoring remains the first filter | It catches restatement cheaply; the Fable semantic judge now catches conceptual collisions on high-diversity rounds. |

---

## Deliberately out of scope for V1

Architected for, not built. Building any of these before the engine works
would have been the wrong order.

- Graphical dashboard
- Billing, subscriptions, public accounts, teams
- Marketing site
- App store publishing
- iOS builds
- Analytics platform
- Server-side database infrastructure

---

## Next milestones

1. **First live round against a real Android app.** Requires a target
   repository, an authenticated Claude CLI, and a `GITHUB_TOKEN`.
2. **First real APK.** Add signing configuration to the target and confirm an
   installable artifact.
3. **Second generation.** Choose a winner and confirm generation 2 bases
   itself on the winner's branch with compounding design work.

After that, the highest-value additions are a real screenshot-capture
adapter behind the existing interface (so review judges rendered output
rather than diffs), and a read-only web view over the existing state
directory.
