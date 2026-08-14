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

---

## Implemented but not yet exercised against a real Android app

These are complete and unit-tested, but have not been run end to end against a
live repository with real model calls and a real GitHub Actions build. That is
the next milestone, not a gap in the code.

- Live Fable/Sonnet/Opus round on a real mobile application.
- A real GitHub Actions run producing a downloadable APK.
- `designlab status --refresh` against a live Actions API.

The distinction matters: the pipeline is proven, the integration with live
external services is proven only in unit tests against fixtures.

---

## Known limitations

| Limitation | Detail |
| --- | --- |
| Screen discovery is heuristic | No universal definition of a "screen" across frameworks. Every screen records its source path so results are checkable. |
| Shell-construct commands are not executed | `cd android && ./gradlew …` is reported as `not-configured`. Such commands belong in CI. |
| Behavioural invariants are not mechanically checked | They are context for agents and reviewers. Path rules carry the enforcement burden. |
| APKs are unsigned by default | Generated workflows build unsigned release APKs; signing configuration is the operator's. |
| Single target repository per project | Monorepos with several apps need one DesignLab project per app. |
| GitHub Actions only | The `ActionsClient` interface makes another CI provider a new implementation, not a rewrite. |
| Diversity scoring is lexical | Token overlap, not semantics. It reliably catches restatement, not deep conceptual similarity. |

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

After that, the highest-value additions are a screenshot capture step (so
review can judge rendered output rather than diffs), and a read-only web view
over the existing state directory.
