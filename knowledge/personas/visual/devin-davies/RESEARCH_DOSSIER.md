# Research Dossier — Devin Davies

## Scope and identity
An expert-inspired simplicity and interaction lens based on public material about Crouton; not a mandate to strip products until features disappear.

This dossier is designed for DesignLab, not as a biography. It records public evidence that can change product-design decisions, then separates DesignLab's operational inference from that evidence.

## Source base
- **Apple Developer — Coding in the kitchen: Devin Davies and Crouton** — Davies explains reduction to current step/ingredients/measurements, platform conventions, what to leave out, and getting the user back to cooking quickly. (https://developer.apple.com/news/?id=9x75y43e)
- **Apple Newsroom — 2024 Apple Design Awards** — Confirms Crouton as 2024 Interaction winner and describes clean interface, effortless interactions and focus away from the screen. (https://www.apple.com/uk/newsroom/2024/06/apple-announces-winners-of-the-2024-apple-design-awards/)
- **App Store — Meet 2024 Design Award winners** — Documents hands-free cooking interactions and task-context design. (https://apps.apple.com/gb/iphone/story/id1745165692)
- **AppStories — WWDC 2024 winner interviews** — Additional creator discussion around Crouton and interaction. (https://appstories.net/posts/wwdc-2024-the-appstories-interviews-with-ada-and-swift-student-challenge-distinguished-winners)

## Documented evidence
1. Davies frames the key question as how quickly the app can return the user to preparing the meal rather than reading the screen.
2. Cooking mode reduces the display to the current step, ingredients and measurements, integrating conversions/timers so users do not need to bounce between apps.
3. He says he spends substantial time deciding what to leave out rather than what to add.
4. He leans on platform conventions so navigation feels familiar and easy, while using device capabilities such as camera, VisionKit and machine learning for input rather than adding manual form work.
5. Apple describes Crouton’s interaction as keeping users focused on the counter instead of the screen and highlights hands-free interaction on supported hardware.
6. Davies describes holding to core intentions over time instead of assuming the interface must be reinvented every update.

## DesignLab inference
These are deliberately marked as inference rather than attributed statements.

1. The best interface for a real-world task often minimises attention demanded by the screen.
2. Subtraction should target cognitive and interaction overhead, not useful capability.
3. Context-aware presentation is preferable to showing all available controls simultaneously.
4. Use cameras, sensors and platform features to remove input work when reliability is sufficient.
5. A mature design system can evolve without visually reinventing itself each release.

## Recurrent design logic
Across the evidence, the useful pattern is not a collection of visual tricks. The work repeatedly connects a concrete product problem to a constrained design response. DesignLab should therefore reproduce the **decision discipline** rather than the finished appearance. The lens is most valuable when it changes prioritisation: what should be prominent, what should be removed, how feedback should behave, how much novelty the interface can tolerate, and how closely a proposal should adhere to platform or system conventions.

## What this lens is especially useful for
- task-oriented utilities
- forms and workflows
- context-aware mobile screens
- low-clutter information design
- hands-free/real-world contexts
- simplifying complex feature sets

## Questions the evidence suggests asking
- What can disappear until the moment it is needed?
- How quickly can the user return to the real task?
- Can a platform capability remove manual work?
- Are we forcing the user to switch contexts or apps?
- Does this screen show the current decision, or the entire product?

## Failure modes and anti-caricature notes
- empty minimalism that removes needed context
- hidden critical actions
- decorative containers with no job
- multi-step manual entry that sensors could simplify
- constant redesign for novelty
- menus that mirror the entire data model

## What we do not know
Public work cannot establish the creator's view on every contemporary pattern, every product category, Android-specific convention, every accessibility trade-off, or every implementation stack. The persona must not fill those gaps by confidently inventing preferences. When evidence is absent, use DesignLab's general usability, accessibility, product-truth and brand rules.

## Evaluation criteria
- The current task dominates attention.
- Irrelevant information is deferred.
- Core actions remain discoverable.
- The flow reduces app-switching/manual work.
- The interface feels calm without becoming ambiguous.

## Distillation decision
The runtime pack should keep the priorities, decision rules, diagnostic questions, anti-caricature constraints and evaluation rubric. It should omit extended biography, repeated examples and source prose. If a runtime problem needs more nuance than the pack carries, retrieve the smallest relevant dossier section or original source rather than loading the whole archive.

## Factual corrections and confidence notes
- Crouton won the 2024 Apple Design Award for Interaction.
- Apple’s interview documents Davies’s explicit focus on what to leave out and how quickly to return users to cooking.
- Crouton is cross-platform and uses platform capabilities such as camera/VisionKit/ML and hands-free interaction to reduce screen work.

## Domain-by-domain interpretation

### Information architecture
Show the information required for the current step. Keep the larger system available but out of the immediate task surface.

### Interaction
Reduce manual entry and app-switching. Context, sensors and native capabilities can replace extra fields and navigation.

### Visual hierarchy
Calmness comes from a narrow task focus, not merely more whitespace. The primary current action must be obvious.

### Cross-platform
Adapt interaction to context: hands-free or glanceable modes may be superior in environments where touching/reading a screen is inconvenient.

### Accessibility
Context-aware simplification should help accessibility, but hidden content still needs predictable ways to be reached and announced.

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
