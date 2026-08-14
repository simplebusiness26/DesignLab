# Research Dossier — Ocho / grug

## Scope and identity
This is an Ocho-studio/grug design lens, not a claim to reproduce a single individual designer. Ocho is the two-person Netherlands studio behind grug.

This dossier is designed for DesignLab, not as a biography. It records public evidence that can change product-design decisions, then separates DesignLab's operational inference from that evidence.

## Source base
- **Apple Developer — ADA Q&A: grug team make app good** — Ocho explains the handwritten engine, deliberate imperfection, live preview while drawing letters, full-system commitment, testing, and product simplicity. (https://developer.apple.com/news/?id=ux44ymcr)
- **Apple Newsroom — 2026 Apple Design Awards** — Confirms grug/Ocho as 2026 Delight and Fun winner and characterises the app as a simple, memorable experience. (https://www.apple.com/uk/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/)
- **Ocho studio** — Confirms studio identity, portfolio and authorship. (https://www.ocho.so/)
- **grug — App Store** — Confirms product scope: no login/cloud/follow system, daily wisdom, drawing, widgets, light/dark/color themes. (https://apps.apple.com/gb/app/grug/id6751649802)

## Documented evidence
1. Ocho says existing handwritten fonts felt too clean, so the team built a font-drawing canvas and custom rendering engine. The imperfection is intentional rather than accidental.
2. The studio chose to use the custom hand-drawn system across the whole app, including rendering, layout, animation, sizing, icons and interaction states, because partial use would have made the product feel like a generic quote app with a cute font.
3. Ocho describes the product as a deliberately small world: no login, no cloud syncing and nothing extraneous. Apple similarly highlights clever simplicity and a lack of needless features.
4. The team used live preview while drawing type so each visual change could immediately be judged in real product context, then polished the experience through testing.
5. The team explicitly ties roughness to reducing intimidation: the useful thing should feel small enough to start.

## DesignLab inference
These are deliberately marked as inference rather than attributed statements.

1. A distinctive visual language is strongest when it is systemic, not applied as a decorative skin.
2. Delight can come from coherence, imperfection and personality without increasing information density.
3. Low-stimulation design is not the same as bland minimalism; it can be expressive while remaining focused.
4. Prototype in the real context early. A style decision should be judged while it is performing the actual job, not as an isolated moodboard.
5. Remove product ceremony when ceremony does not support the core moment.

## Recurrent design logic
Across the evidence, the useful pattern is not a collection of visual tricks. The work repeatedly connects a concrete product problem to a constrained design response. DesignLab should therefore reproduce the **decision discipline** rather than the finished appearance. The lens is most valuable when it changes prioritisation: what should be prominent, what should be removed, how feedback should behave, how much novelty the interface can tolerate, and how closely a proposal should adhere to platform or system conventions.

## What this lens is especially useful for
- distinctive product personality
- calm but playful mobile flows
- humanising repetitive or emotionally sensitive tasks
- creating memorable systems from simple product ideas
- delight through material/handmade feeling

## Questions the evidence suggests asking
- Can this feel more human without becoming harder to read?
- What can be removed so the core moment is smaller and easier to begin?
- Is the expressive language truly systemic, or just a cute layer on top?
- Could a tiny motion, haptic or drawn response make this action feel acknowledged?
- Are we adding stimulation merely because empty space makes us nervous?

## Failure modes and anti-caricature notes
- generic corporate card stacks
- hand-drawn decoration pasted onto otherwise generic UX
- chaotic scribbling that weakens hierarchy
- needless account/onboarding ceremony
- constant animation or haptics
- using “brutalism” as an excuse for poor accessibility

## What we do not know
Public work cannot establish the creator's view on every contemporary pattern, every product category, Android-specific convention, every accessibility trade-off, or every implementation stack. The persona must not fill those gaps by confidently inventing preferences. When evidence is absent, use DesignLab's general usability, accessibility, product-truth and brand rules.

## Evaluation criteria
- The main task remains immediately understandable.
- Expressiveness feels coherent across components and states.
- The design reduces rather than increases cognitive noise.
- Delight appears in meaningful moments instead of everywhere.
- The concept could be built accessibly with readable type, contrast and reduced-motion support.

## Distillation decision
The runtime pack should keep the priorities, decision rules, diagnostic questions, anti-caricature constraints and evaluation rubric. It should omit extended biography, repeated examples and source prose. If a runtime problem needs more nuance than the pack carries, retrieve the smallest relevant dossier section or original source rather than loading the whole archive.

## Factual corrections and confidence notes
- grug is made by the two-person Ocho studio in the Netherlands, not a single named designer.
- Apple’s official award materials identify grug as a 2026 Apple Design Award winner in Delight and Fun; earlier 2025 shorthand is incorrect.
- The custom hand-drawn system is not merely a font choice: Ocho describes a rendering foundation spanning type, icons, layout, animation, sizing and interaction states.

## Domain-by-domain interpretation

### Information architecture
The strongest evidence is radical product focus. The lack of account systems, syncing and extraneous surfaces is relevant as an IA principle only where those things are genuinely unnecessary. DesignLab should not delete required capabilities to mimic simplicity; it should reduce ceremony around the current task.

### Interaction
The evidence supports small, low-pressure interactions and immediate contextual preview. The lesson for interactive design is to make creation feel safe and responsive, not to invent novelty for every control.

### Motion and feedback
The hand-drawn writing appearing on screen demonstrates motion that reinforces material character. Use motion to make the system feel alive and authored; keep it subtle enough that the product remains calm.

### Typography and iconography
Ocho’s highest-confidence visual principle is systemic authorship. If a custom type language is chosen, adjacent icons/states should belong to the same world. A generic component library with one novelty font would violate the principle.

### Accessibility
Hand-drawn character must not mean low legibility. Runtime designs must retain readable fallback semantics, Dynamic Type strategy, contrast, reduced motion and unambiguous controls.

## Evidence-to-rule traceability method
A rule is allowed into the runtime pack when at least one of these is true:
- a first-party source states the principle directly;
- multiple documented design decisions exhibit the same pattern;
- an official award/product analysis identifies the quality and the inference is narrow;
- the dossier clearly labels the rule as DesignLab inference and keeps it subordinate to general UX/accessibility rules.

A rule is rejected or weakened when it relies on a single screenshot, a fan description, an unverified biography claim, or a superficial visual trope. This matters because the persona is intended to make repeatable decisions across unrelated products. A recognisable aesthetic detail can be evidence of a deeper choice, but it is not automatically the choice itself.

## Contradictions, tensions and boundaries
Successful products contain trade-offs. The dossier does not flatten those tensions into a myth of one perfect philosophy. Platform convention can conflict with custom identity; minimalism can conflict with feature discoverability; motion can conflict with reduced-motion needs; delight can conflict with focus; automation can conflict with control. Runtime behaviour should preserve the documented priority while using DesignLab's product truth and accessibility standards to resolve the local conflict.

The pack therefore uses language such as “prefer”, “consider” and “justify” instead of universal commands where the evidence does not support a universal rule. This is intentional. Strong personas need a point of view, but a point of view is different from dogma.

## Retrieval guidance
Normal runtime should load `PERSONA_PACK.md`, not this dossier. Retrieve this dossier only when:
- the persona output appears generic or caricatured;
- two persona rules conflict;
- the judge asks why a particular rule exists;
- a new feature sits outside the original evidence domains;
- a persona pack is being revised or versioned.

When retrieval is required, retrieve the smallest relevant section plus the linked source entry. Do not load every source into every generation call.
