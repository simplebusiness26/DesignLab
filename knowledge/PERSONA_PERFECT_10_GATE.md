# DesignLab Perfect-10 Persona Quality Gate

## Purpose

This is a **DesignLab system rule**, not a trait of any named designer persona.

It applies to every current and future persona in every DesignLab design tournament. Persona-specific behaviour must continue to come from that persona's evidence-backed research. This gate only determines whether the resulting design is good enough to submit.

This file has precedence over any older persona-local readiness threshold. If a persona pack says that 4/5 is sufficient, that statement is superseded by this global gate. Do not rewrite research-derived persona behaviour merely to satisfy the gate.

## Non-negotiable pass rule

A design may be submitted only when it earns **5/5 in all ten universal areas** below.

There is no averaging and no compensation between categories.

`5, 5, 5, 5, 5, 5, 5, 5, 5, 4 = FAIL`

A failed design must be revised, then the **entire design must be rescored from zero** because a fix in one area can create a regression in another.

## What 5/5 means

5/5 does not mean metaphysical perfection. It means that, against the current Product Truth, evidence, scope, platform constraints and known states, the evaluator can identify **no material unresolved weakness** in that area that should prevent the concept from entering the tournament.

A score of 5 must be justified with concrete evidence from the design. Unsupported self-awarded scores are invalid.

For every category, the evaluator must record:
- the score;
- the exact screens, flows, states, interactions or architectural decisions that justify it;
- any remaining non-material limitation;
- why that limitation does not reduce the score below 5.

If the evaluator cannot point to evidence, the maximum score is 4.

## The ten universal areas

### 1. Product Truth Fidelity
The proposal preserves the real product's capabilities, roles, permissions, routes, data relationships, safety constraints and backend reality. It neither invents functionality nor silently removes existing capability.

### 2. User-Goal Clarity
The primary purpose of each important surface and flow is immediately understandable. The design helps users accomplish real product goals without unnecessary ceremony, ambiguity or cognitive load.

### 3. Whole-App Coherence
The proposal behaves like one designed product rather than a collection of attractive screens. Navigation, hierarchy, components, interaction logic, terminology and visual/UX principles remain coherent across major and secondary routes.

### 4. Information Architecture & Navigation
Users can predict where things live, understand where they are, move between major product areas and recover from navigation mistakes. Complexity is organised rather than hidden or duplicated.

### 5. Interaction & State Robustness
Core interactions work across populated, empty, loading, error, permission-denied, offline/slow, keyboard, long-content and relevant edge states. Critical actions do not depend solely on undiscoverable gestures or fragile animation.

### 6. Accessibility & Inclusion
The concept supports readable/scalable text, sufficient contrast, usable target sizes, sensible focus/reading order, screen-reader semantics, reduced-motion alternatives and non-colour-only status communication. Accessibility is structural, not a cleanup pass.

### 7. Trust, Safety & Privacy
The design communicates consequential states clearly, respects permissions and privacy boundaries, avoids dark patterns, gives appropriate control and confirmation, and does not weaken the product's safety model for visual simplicity or novelty.

### 8. Technical & Performance Realism
The proposal is implementable within the actual architecture and platform. Motion, maps, media, real-time behaviour, data density and custom interaction ideas have plausible performance and fallback strategies. Essential UX is separated from optional polish.

### 9. Persona Research Fidelity
The proposal visibly follows the persona's evidence-backed decision logic, priorities and trade-off style without roleplaying the person, inventing undocumented preferences or reducing them to a signature visual trope. A different persona should not plausibly have produced the same reasoning unchanged.

### 10. Originality, Craft & Product Potential
The proposal is an original solution for the actual product, not a copy of a referenced creator's known work. Details, hierarchy, states and interactions are resolved to a professional level, and the concept materially improves the product's potential rather than merely making it look different.

## Automatic fails

The design fails regardless of numeric scores if any of the following are true:
- it invents or removes material product capability without explicit approval;
- it breaks account, permission, privacy or safety rules;
- it copies recognisable screens, assets, trade dress, branded patterns or proprietary material from a referenced creator/product;
- it relies on a critical hidden gesture with no accessible/discoverable alternative;
- it covers only a hero screen while important routes/states remain incoherent;
- it claims 5/5 without specific evidence;
- it hides a known material weakness to preserve a perfect score;
- it violates an explicit locked design decision or approved Design Constitution.

## Evaluation procedure

1. Build the proposal from Product Truth and the active persona pack.
2. Run the persona's own research-derived self-review first.
3. Run this Perfect-10 Gate separately. Do not let persona enthusiasm inflate the score.
4. For each of the ten areas, record evidence and assign 1-5.
5. If any area is below 5, mark the proposal `BLOCKED` and identify the precise deficiency.
6. Revise the design specifically against the failed evidence.
7. Re-run Product Truth checks.
8. Re-score **all ten areas**, not only the failed area.
9. Repeat until all ten areas are independently defensible at 5/5.
10. Only then mark the proposal `ELIGIBLE_FOR_TOURNAMENT`.

## Score integrity rule

The goal is not to produce ten 5s. The goal is to produce a design that deserves ten 5s.

When uncertain between 4 and 5, score 4 and revise. Missing evidence, untested assumptions, unresolved edge cases and hand-waved implementation details cannot receive a 5.

## Relationship to persona-specific rubrics

Persona-specific rubrics remain useful because they test whether a concept genuinely embodies that designer's documented thinking. They are **additional diagnostics**, not substitutes for this gate.

A persona may have unique criteria that another persona does not. Those criteria should remain intact. However, no persona-specific rule may lower the universal submission threshold below 5/5 across these ten areas.

## Output requirement

Every tournament submission must include a compact Perfect-10 evidence report with all ten scores and their proof. The report is review metadata; it should not alter the design itself or pressure personas toward the same aesthetic solution.
