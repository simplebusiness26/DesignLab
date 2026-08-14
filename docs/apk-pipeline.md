# APK pipeline

Compiling Android apps is deterministic work. No model reasoning is involved
at any point in this subsystem, and DesignLab never invokes a model while
waiting on Gradle.

---

## Strategy selection

In order of preference:

1. **`reuse-existing`** — the target repository already builds Android
   artifacts. A project that ships APKs knows more about its own signing,
   caching and flavours than any generator could. DesignLab reuses it and
   tells you what to check.
2. **`generated`** — DesignLab emits the smallest workflow that fits the
   detected stack.
3. **`unsupported`** — neither is possible. Stated plainly, never pretended.

```bash
designlab workflow           # show the plan and the workflow
designlab workflow --write   # write it into the working clone
```

**Delivery to candidate branches.** GitHub Actions only runs workflow files
that exist on the pushed ref. When DesignLab generates a workflow, it is
therefore committed onto each candidate branch — as a marked
`[designlab-plumbing]` commit at the tip, applied after all gates — right
before the push (`build.commitWorkflowToCandidates`, default on). The base
branch is never touched, and `designlab merge-check` verifies the plumbing
commit is dropped before a merge.

## Build variant and installability

The default variant is **debug**, deliberately: debug APKs are signed with
the debug keystore automatically and install on any device, which is what a
design evaluation needs. An unsigned release APK builds green and installs
nowhere.

Alongside `BUILD_SUCCESS`, every build records an installability verdict:

| Verdict | Meaning |
| --- | --- |
| `DEVICE_INSTALLABLE` | Debug variant, or release with `build.releaseSigned: true` |
| `NOT_INSTALLABLE` | Release variant without signing — Android will refuse the APK |
| `UNKNOWN` | Variant not recorded |

Set `build.variant: "release"` only when the target has real signing
configured, and say so with `build.releaseSigned: true`.

---

## Supported build systems

| Detected | Generated workflow (debug variant by default) |
| --- | --- |
| `gradle` | JDK 17 + Android SDK → `./gradlew assembleDebug` |
| `expo-prebuild` | Node + `expo prebuild --platform android` → Gradle |
| `eas-build` | `eas build --platform android --profile preview --wait` (profile governs the variant) |
| `flutter` | `flutter-action` → `flutter build apk --debug` |
| `capacitor` | Web build → `cap sync android` → Gradle |
| `none` / unknown | `unsupported`, with an explanation |

Node projects get package-manager-aware setup and caching (npm, yarn, pnpm,
bun).

---

## Artifact naming

Names are derived **at run time from the branch**, which is why a single
workflow serves every design without DesignLab injecting per-branch variants:

```
branch:   design/r001-a-immersive
                  │    │  └── slug
                  │    └───── slot
                  └────────── round

artifact: fieldnotes-R001-A-immersive.apk
          └── app slug
```

The workflow parses `${GITHUB_REF}`, uppercases the round and slot, and
uploads the APK under that name. If the build produces no `.apk`, the step
fails loudly rather than uploading nothing.

---

## Build state

| Status | Meaning |
| --- | --- |
| `BUILD_NOT_REQUESTED` | Not pushed — dry run, pushing disabled, or the candidate did not succeed |
| `BUILD_PENDING` | Pushed; no run has appeared yet, or it is queued |
| `BUILD_RUNNING` | A workflow run is in progress |
| `BUILD_SUCCESS` | Actions reports a completed successful run **and** a real, unexpired artifact |
| `BUILD_FAILED` | Run failed, or succeeded but produced no artifact, or the artifact expired |
| `BUILD_UNSUPPORTED` | No Android build strategy is available |

**DesignLab never claims an APK exists unless GitHub says one does.** Every
transition out of `BUILD_PENDING` requires a real Actions API response. Three
consequences worth stating explicitly:

- A workflow run that succeeds but uploads nothing is `BUILD_FAILED`, not
  success. A green tick is not an APK.
- An expired artifact is `BUILD_FAILED`, because it can no longer be
  downloaded.
- An unreachable GitHub API leaves the state **untouched** with a note. An
  outage is not evidence of failure.

Runs are matched against the exact commit DesignLab pushed. When no run
exists for that commit, the state stays `BUILD_PENDING` with an explanation —
a stale run for another commit on the branch, even a successful one, is
never reported as this commit's result.

---

## Refreshing

```bash
designlab status --refresh
```

Requires `GITHUB_TOKEN` (or `GH_TOKEN`) with `actions:read` on the target
repository, and a GitHub-hosted target. Without either, the command says so
rather than reporting stale state as fresh. Polling is plain HTTP — no model
is involved.

---

## What you must set up

With the default **debug** variant, nothing beyond enabling GitHub Actions:
debug APKs are signed with the debug keystore and install on any device with
"install unknown apps" allowed.

For **release** builds:

- **Gradle / Expo prebuild** — add the keystore and its secrets to the
  repository, reference them in the workflow, and set
  `build.releaseSigned: true` so installability is reported correctly.
- **EAS** — add an `EXPO_TOKEN` repository secret.

`designlab workflow` lists the requirements for your detected stack.

Generated workflows are safe to edit; DesignLab will not overwrite an existing
file.
