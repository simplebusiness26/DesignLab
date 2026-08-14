# Candidate identity and merge-readiness

Two halves of the same lifecycle: getting several candidate APKs onto one
phone for evaluation, and getting the winning candidate back into the real
application afterwards — with nothing temporary leaking across.

```
candidate branch
   ├─ design commits                ← the merge content
   ├─ [designlab-plumbing]  commit  ← build workflow      (temporary)
   └─ [designlab-identity]  commit  ← app identity suffix (temporary)
        │
        ▼ device testing → human approval
        ▼ designlab merge-check <round> <slot>
        ▼ human merges the DESIGN HEAD only
```

Engine commits carry machine-readable markers in their commit subjects and
are always appended at the branch tip, **after** every gate and review ran —
so verification always judged pure design content, and dropping the
temporary parts means merging an earlier commit, nothing more.

---

## Side-by-side installs: the identity overlay

Android refuses to install two APKs with one applicationId, so evaluating
A/B/C/D on one phone needs per-candidate identities:

```
com.example.app.designlab.a   "MyApp A"
com.example.app.designlab.b   "MyApp B"
```

**Off by default** (`build.candidateIdentity: "off"`), because changing an
applicationId genuinely breaks things on real apps:

| Integration | What breaks |
| --- | --- |
| Firebase (`google-services.json`) | Config is bound to the applicationId |
| OAuth / Google Sign-In | Redirects and SHA-1 registrations reference the id |
| Restricted Maps API keys | Allow specific package names only |
| Verified app links (`autoVerify`) | Verification fails under a new id |

When enabled (`"suffix"`), the overlay is **risk-gated**: the candidate
worktree is scanned for those exact markers, and if any are found the overlay
is refused with the reasons recorded on the candidate
(`identity.applied: false`). `build.allowRiskyIdentity: true` overrides,
accepting that those integrations will not work in candidate builds.

Mechanism per stack — always a single marked commit editing only the
identity surface:

- **Expo** — `app.json`: `expo.name` and `expo.android.package` suffixed.
- **Gradle / React Native / Flutter / Capacitor** — a marker-delimited block
  appended to `android/app/build.gradle` using Gradle's own
  `applicationIdSuffix` on the build types, plus `strings.xml` `app_name`
  when it exists.

A design that tries to change app identity *itself* fails the protection
gate (`invariant:app-identity`) — identity is never a design decision, and
side-by-side identities come only from this engine step.

---

## Merge-readiness: `designlab merge-check`

```bash
designlab merge-check 1 C
```

A winning candidate is not a disposable prototype; its branch must be able
to become the application. `merge-check` verifies that, deterministically:

1. **Engine commits are peelable.** Marker commits must sit in one contiguous
   run at the tip. A marker commit buried under design work is a blocker.
2. **The design content re-passes the Functionality Contract** — including
   the invariant guards — against the *current* base branch tip. Protection
   is re-checked at merge time, never trusted from round records.
3. **The merge is conflict-free**, checked with `git merge-tree` without
   touching any working tree.

Output is `MERGE_READY` or `NOT_MERGE_READY` with every blocker named
(exit code 8 when not ready, so it works as a CI gate).

**It never merges.** When ready, it prints the exact human commands:

```
git checkout main
git merge --no-ff <designHeadSha>   # design content only
```

Merging the design head — not the branch tip — is what leaves the workflow
and identity commits behind. Nothing temporary reaches production, and the
suffixed identity disappears with the branch.
