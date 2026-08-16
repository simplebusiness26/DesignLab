# Xplorer Tournament B — Product Truth V2 Contract

Status: LOCKED SHARED INPUT
Contract revision: `2.0-capability-first`
Source product: `simplebusiness26/The-App`
Frozen source commit: `78632b12eeb4e4123b1a767c8b815fe6617681f9`

## Purpose

This contract corrects an enforcement problem discovered during the Alex Schleifer candidate: implementation-specific regression expectations could overrule legitimate persona-led redesign decisions even when the underlying Xplorer capability remained intact.

From this revision onward, **Product Truth protects the product, not the current interface**.

A challenger gets genuine authority to rethink Xplorer's information architecture, navigation, screen composition, interaction mechanics, gestures, hierarchy, visual system, motion and cross-route journeys. The challenger is blocked only when a change loses, invents, misrepresents or weakens a real product capability, lifecycle, permission, privacy rule, safety boundary or data consequence.

## 1. Three-layer contract

### Layer A — Immutable Product Truth

These cannot be redesigned away:

- real product capabilities and entity relationships;
- Explorer as the universal human identity;
- Manager as granular capability rather than a second identity;
- Admin as separate privilege;
- mutual-follow Friend semantics and owner-controlled Close Friends;
- audience/privacy semantics and fail-closed behaviour;
- database/RLS-backed permission and ownership boundaries;
- Moment, Memory, Review and Check-in meanings/lifecycles;
- Claim versus own-entity creation distinction;
- attendee/member/private-board protection;
- safety, blocking, reporting and location-privacy consequences;
- canonical product vocabulary where it maps to stored or security-relevant meaning;
- real data availability and backend behaviour;
- capabilities represented by the frozen source that a candidate would otherwise remove.

A challenger may change how any of these are presented, reached or explained, but not what they mean or what the user is ultimately allowed to do.

### Layer B — Required Functional Outcomes

These outcomes must remain achievable, but **the current implementation mechanism is not sacred**.

Examples:

- an Explorer can reach local discovery, map, live activity, messages, profile, contribution/reputation and management capabilities;
- a user can get from local discovery to a relevant place/activity action;
- an Explorer can capture and publish a Moment or Memory through the product's in-app capture law;
- an Explorer can find Discover from the broader exploration experience;
- authorised users can reach Friend/listing/board communication contexts;
- users can navigate into and out of top-level and child experiences coherently;
- Manager and Admin work remains reachable only for legitimate capability/privilege;
- all material capability families represented by the 76-route frozen inventory remain covered even if routes are regrouped, combined, nested or visually replaced.

The designer chooses the interaction pattern that fulfils the outcome.

### Layer C — Designer-Owned Implementation

Unless a choice directly violates Layer A or prevents Layer B, the challenger owns it.

Designer-owned choices include:

- primary tabs and their number/order;
- whether tabs are used at all;
- headers, chrome and navigation bars;
- Back-button presentation on root surfaces;
- placement and shape of controls;
- centre-button behaviour;
- gestures and gesture thresholds;
- whether an action is reached by tap, swipe, sheet, menu, dock, contextual control or another accessible interaction;
- screen grouping and route-to-screen mapping;
- Map / Discover / Live relationship;
- hierarchy, density and disclosure strategy;
- cards, lists, panels, sheets and component language;
- copy that is not canonical/security-relevant vocabulary;
- typography, colour, iconography, spacing, depth and visual character;
- animation, transitions and direct manipulation;
- empty/loading/error-state presentation;
- Manager/Admin surface organisation;
- responsive and web presentation.

**The frozen UI is evidence of what exists, not a template and not a hidden specification.**

## 2. Truth precedence under V2

When evidence conflicts, use this order:

1. frozen database schema, migrations, RLS policies and trusted server-side security rules;
2. explicit immutable product semantics in this V2 contract and `PRODUCT_TRUTH.json`;
3. capability/lifecycle/permission outcomes proven by frozen source code;
4. frozen source UI as evidence of current implementation;
5. automated tests and deterministic gates, classified by what they actually protect;
6. current UI observations in the Annex/Master Brief;
7. older plans and archives.

A test does **not** become Product Truth merely because it exists.

## 3. Regression-gate classification

Every failing gate/test used during a challenger build must be classified before it can force a redesign.

### Blocking failure

A failure is blocking when it demonstrates that the candidate:

- removed or invented a material capability;
- changed product/data meaning;
- weakened privacy, permissions, ownership or safety;
- broke a required lifecycle or access rule;
- introduced a real crash, inaccessible dead end or unusable required state;
- broke accessibility requirements that are independent of a specific visual layout;
- made a required product outcome impossible.

### Advisory / migration failure

A failure is **not automatically blocking** when it only asserts the frozen implementation, for example:

- exact tab labels/order;
- a particular root Back-button rule;
- a specific header shape or height;
- exact location of a control;
- a specific gesture being present or absent;
- a specific route grouping;
- frozen card composition;
- frozen copy that is not canonical product vocabulary;
- exact visual or navigation structure.

Such a failure means the old regression test may need to be replaced with an outcome-level test for that candidate.

### No silent test deletion

Design freedom is not permission to delete failing tests until green. For every implementation-specific test that is retired or rewritten, the candidate must record:

1. what old implementation detail it asserted;
2. which Layer A truth or Layer B outcome still needs protection;
3. the replacement outcome-level verification;
4. evidence that the redesigned implementation passes it.

This keeps the tournament safe without forcing the old interface back into the new design.

## 4. Route rule

The 76 frozen routes are a **capability inventory**, not required information architecture.

A challenger may combine, regroup, nest or replace route presentation if:

- every material capability remains reachable;
- deep-link/technical requirements remain viable where needed;
- no access/privacy boundary is bypassed;
- browser/native validation can still prove the implemented product works.

A route-count gate may verify source coverage; it may not dictate the human navigation model.

## 5. Navigation and gesture rule

Current frozen navigation — including the raised centre control, Camera action, upward Discover gesture and root Back behaviour — is **observation-only**.

The product outcomes to protect are:

- capture remains clearly reachable where the product requires it;
- Discover/local exploration remains clearly reachable;
- major product areas remain understandable and navigable;
- Android/system back and child navigation remain safe and coherent;
- safety-critical actions are never gesture-only.

The persona may replace the current mechanism completely.

## 6. Camera/capture distinction

V2 does **not** treat every interaction detail as free. The in-app capture requirement for Moments/Memories is an intentional product law, not merely a button placement choice.

Therefore a challenger may redesign the camera entry, capture flow, post-capture hierarchy and surrounding navigation, but may not silently turn Moments/Memories into generic upload-first posting if that changes the product's intentional capture model.

This illustrates the V2 rule: preserve the product decision; free the interface decision.

## 7. Verification standard for future candidates

A candidate must pass four distinct layers:

1. **Capability Truth Gate** — product semantics, entity relationships, lifecycles, permissions, privacy, safety and real data consequences.
2. **Outcome Journey Gate** — benchmark user goals remain completable regardless of new IA or interaction pattern.
3. **Runtime Gate** — no crashes, broken required routes/deep links, inaccessible dead ends or build failures.
4. **Design Quality Gate** — transformation, persona fidelity, accessibility, coherence and Perfect-10 evidence.

Legacy UI-regression assertions may contribute diagnostic evidence, but they do not outrank these four layers.

## 8. Existing candidates created before V2

Katie Dill and Alex Schleifer began under the earlier shared-input fingerprint. Their artifacts remain valid historical evidence of what was produced under V1; they must not be silently relabelled as V2 candidates.

Before final apples-to-apples tournament judging, each pre-V2 candidate must receive an explicit V2 review decision:

- **accept as-is under V2**, if the earlier constraints did not materially suppress the persona result; or
- **revision pass under V2**, if old implementation-preserving gates forced meaningful persona decisions back toward the frozen UI.

This review may reuse the existing implementation; it does not require a blind rebuild. The purpose is to restore creative opportunity, not waste completed work.

## 9. Central rule

> Preserve what Xplorer **is and can do**. Give the persona freedom over **how Xplorer should work and feel to a human**.

A beautiful candidate that loses Product Truth fails.

A faithful candidate that merely preserves the old interface also fails the purpose of the tournament.
