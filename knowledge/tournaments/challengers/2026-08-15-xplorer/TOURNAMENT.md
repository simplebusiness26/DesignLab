# Xplorer Challenger Tournament B

Status: ACTIVE — PRODUCT TRUTH V2
Contract revision: `2.0-capability-first`
Date: 2026-08-16
Source product: `simplebusiness26/The-App`
Source branch at freeze: `main2.0-Dev`
Frozen source commit: `78632b12eeb4e4123b1a767c8b815fe6617681f9`
Frozen source tree: `d6aa748c66cf90ee5637e793d71feaa6b4cf399a`

## Purpose

Tournament B asks seven independent research-backed design personas one question:

> Given everything Xplorer genuinely **is and can do** at the same frozen source commit, what should the best possible Xplorer become?

The frozen product is shared. The professional reasoning lens is the intended creative variable.

## Product Truth V2 correction

During the Alex Schleifer candidate we found a structural problem: some frozen regression tests asserted current UI mechanics strongly enough that they could overrule legitimate persona-led design decisions.

That is now corrected.

**Product Truth protects product capability, meaning, privacy, permissions, safety and data consequences. It does not protect the current interface merely because the current interface has tests around it.**

The authoritative policy is `PRODUCT_TRUTH_V2_CONTRACT.md` plus `PRODUCT_TRUTH.json` schema 2.0.

## Shared Product Truth package

Every challenger receives the same shared product inputs:

1. `PRODUCT_TRUTH_V2_CONTRACT.md`
2. `PRODUCT_TRUTH.json`
3. `MASTER_PRODUCT_BRIEF.md`
4. `PRODUCT_TRUTH_ANNEX.md`
5. `knowledge/prototypes/FULL_APP_HTML_STANDARD.md`
6. `knowledge/ANTI_IMITATION_STANDARD.md`
7. `knowledge/PERSONA_PERFECT_10_GATE.md`
8. this `TOURNAMENT.md`

The Annex remains valuable frozen implementation evidence. Where its current-UI observations conflict with V2 creative freedom, V2 wins.

## Truth precedence

Use this order:

1. frozen database schema, migrations, RLS and trusted server-side security rules;
2. explicit immutable product semantics in Product Truth V2;
3. capability/lifecycle/permission outcomes proven by frozen source;
4. frozen source UI as evidence of how the old version happened to implement those outcomes;
5. automated tests/gates **after classifying what they actually protect**;
6. current UI observations in the Master Brief/Annex;
7. old plans and archives.

The old phrase “frozen source wins” means **frozen product facts win**. It does not mean a challenger must preserve frozen layout, navigation, gestures, headers, cards or control placement.

## Three layers

### A. Immutable Product Truth

Must survive:

- all material capabilities;
- Explorer universal identity;
- Manager capability model;
- Admin privilege separation;
- friendship/Close Friends semantics;
- privacy/audience/presence rules;
- Moment/Memory/Review/Check-in meanings and lifecycles;
- Claim/ownership boundaries;
- attendee/member/private-board protection;
- safety/location consequences;
- real backend/data behaviour;
- canonical security-relevant vocabulary.

### B. Required outcomes

Must remain possible, but the mechanism can change:

- discover and understand local places/activity;
- move from discovery to legitimate action;
- reach capture and create supported Moment/Memory content under the in-app capture law;
- reach authorised messaging contexts;
- manage legitimate entities when capability allows;
- use Admin only with Admin privilege;
- complete the common benchmark journeys;
- reach all material capability families represented by the frozen 76-route inventory.

### C. Designer-owned implementation

The persona has full authority over:

- navigation architecture;
- tab number/order or whether tabs exist;
- headers and chrome;
- root Back-button presentation;
- screen grouping;
- route-to-screen mapping;
- control placement;
- centre-button mechanics;
- tap/swipe/sheet/menu/dock patterns;
- Map/Discover/Live relationship;
- hierarchy/density;
- components and surfaces;
- visual system;
- motion/direct manipulation;
- Manager/Admin organisation;
- failure/loading/empty-state presentation.

A challenger does not need permission to depart from the frozen UI.

## Regression-gate rule

A failing test may force redesign only when it proves a violation of Layer A or Layer B, a real runtime/build failure, or a layout-independent accessibility failure.

A test that only asserts the old implementation is diagnostic. Examples include exact tab order, exact header structure, a particular root Back-button rule, exact control placement, a particular gesture, old card composition or old screen grouping.

### No test laundering

Design freedom is not permission to delete tests until green.

Whenever a frozen implementation-specific assertion is retired or rewritten, the candidate must record:

1. the old implementation detail it protected;
2. the actual product truth/outcome beneath it;
3. the new outcome-level test or evidence;
4. proof that the redesigned implementation passes that replacement.

This is how DesignLab gives a persona freedom without returning to fake/broken AI mockups.

## Route rule

The 76 frozen routes are a capability inventory, not required human information architecture.

Candidates may combine, regroup, nest or visually replace route presentation. They may not lose the material capability, break required deep-link/runtime behaviour, or bypass access rules.

## Shared rules

Every candidate must redesign Xplorer as one coherent whole product, not a set of showcase screens.

Candidates may radically change layout, IA, navigation, interaction language, density, visual system and motion philosophy.

Candidates may not invent capabilities, account models, permissions, backend behaviour or data that the frozen product does not support.

## Challenger roster

1. **Katie Dill** — whole-service journeys, trust, human experience and digital-to-real-world handoff.
2. **Alex Schleifer** — product journey, systems, cross-disciplinary product building and real-world outcomes.
3. **Karri Saarinen** — context/fit, coherent product systems, signal over noise and implementation-aware craft.
4. **Rauno Freiberg** — direct manipulation, interaction mechanics, responsiveness, prototyping and purposeful motion.
5. **Rasmus Andersson** — product architecture, data/state models, executable prototyping and deep functional craft.
6. **Talia Cotton** — meaningful computational systems, authored variability, data-reactive expression and scalable generators.
7. **Emil Kowalski** — immediate feedback, frequency-aware motion, performance, accessibility and motion restraint.

Each challenger loads only its own `PERSONA_PACK.md` on top of the shared Product Truth package.

## Runtime

Dedicated runtime: `src/tournaments/xplorer-challenger-b.ts`

Commands:

```text
designlab challenger validate
designlab challenger status
designlab challenger prepare <challenger>
designlab challenger verify <challenger>
```

The runtime is model-agnostic. It assembles deterministic inputs and validates outputs; the chosen orchestrator performs the actual design reasoning.

### `challenger validate`

Must verify:

- all shared inputs exist;
- Product Truth points to the exact frozen source SHA/tree;
- Product Truth is contract revision `2.0-capability-first`;
- the frozen route inventory contains 76 unique routes;
- all persona packs exist and are substantial;
- immutable identity/privacy/lifecycle laws are represented;
- the shared-input fingerprint is deterministic.

### `challenger prepare`

The packet must instruct the challenger that:

- frozen **product facts** win;
- frozen **UI implementation does not**;
- legacy regression assertions require classification;
- navigation and interaction architecture are persona-owned;
- outcome-level replacement verification is required when implementation-specific tests are retired.

### `challenger verify`

Required candidate artifacts remain:

```text
prototype/index.html
DESIGN_THESIS.md
SELF_REVIEW.md
PERFECT_10.json
PRODUCT_TRUTH_CHECK.json
RESULT.json
```

For post-Katie transformation candidates, `DESIGN_DELTA.json` remains required.

A candidate cannot lock merely because a model says it is finished.

## Product Truth blocking rule

Block a candidate if it:

- invents/removes a material capability;
- changes identity or relationship semantics;
- conflates Moment/Memory lifecycles;
- breaks Check-in/presence/privacy rules;
- leaks attendee/member/private-board data;
- weakens Claim/Admin/ownership boundaries;
- presents future capabilities as current;
- breaks a required benchmark outcome;
- creates a real crash/build/accessibility dead end;
- covers only showcase screens while major capability families are unresolved.

Do **not** block merely because the candidate uses a different header, tab system, gesture, root navigation convention, screen grouping or component composition.

## Execution structure

Each challenger begins from the same frozen source SHA and never inherits another challenger’s implementation:

```text
XPLORER 78632b12...
 ├─ Katie Dill
 ├─ Alex Schleifer
 ├─ Karri Saarinen
 ├─ Rauno Freiberg
 ├─ Rasmus Andersson
 ├─ Talia Cotton
 └─ Emil Kowalski
```

For each V2 candidate:

1. pin the frozen source;
2. load Product Truth V2;
3. load only that persona;
4. inspect the real source for capability/data reality;
5. model whole-product journeys/states;
6. design from persona reasoning rather than frozen screens;
7. implement the coherent candidate;
8. classify legacy regression failures;
9. replace implementation-specific assertions with outcome-level protection where necessary;
10. run capability truth gates;
11. run benchmark outcome gates;
12. run runtime/browser/build gates;
13. run persona self-review and Design Transformation gate;
14. run the Perfect-10 gate;
15. freeze only when all genuine blockers pass.

## Pre-V2 candidates

Katie Dill and Alex Schleifer began before this correction. Their work remains historical evidence and must not be discarded automatically.

Before final apples-to-apples judging, each gets an explicit V2 decision:

- **accept as-is**, if V1 did not materially suppress the persona result; or
- **revision pass**, if V1 implementation-preserving gates forced meaningful design decisions back toward the old UI.

The revision path should reuse good completed work. It is not a blind rebuild.

## Fairness

For future candidates, the shared Product Truth V2 package and frozen source remain identical. The only intended creative variable is the persona.

Pre-V2 candidates must be clearly labelled until reviewed under V2; they must never be silently presented as if they had the same creative freedom from the start.

## Central rule

> Preserve what Xplorer **is and can do**. Give the persona authority over **how Xplorer should work and feel**.
