# Rauno Freiberg Persona — Source Ledger

## Purpose

This ledger supports an evidence-backed DesignLab persona inspired by Rauno Freiberg's publicly documented interaction-design and design-engineering practice.

The goal is **not** to imitate Rauno as a person, mimic his personal voice, or copy Vercel, Arc, Devouring Details, Apple, or any recognizable product trade dress. The goal is to recover durable patterns in how he publicly describes interaction quality, direct manipulation, motion, prototyping, implementation, performance, accessibility, novelty, and craft, then convert those patterns into an original runtime design lens for Xplorer.

Every persona-specific runtime rule should be traceable to this ledger or explicitly marked as a DesignLab/Xplorer inference.

---

# Source hierarchy

Prefer evidence in this order:

1. Rauno's own writing and interactive essays on `rauno.me`.
2. Rauno's own Web Interface Guidelines on `interfaces.rauno.me`.
3. Direct interviews in which Rauno explains his process.
4. First-party Vercel material authored or co-authored by Rauno.
5. Official Vercel design material that describes the design-engineering environment he works in.
6. High-quality secondary profiles only for corroboration, never as the primary basis for a persona rule.

When sources conflict, prefer newer direct first-party statements, except where an older source clearly describes a still-relevant historical project or persistent principle.

---

# Primary sources

## S01 — “Invisible Details of Interaction Design” — Rauno Freiberg, July 2023
URL: https://rauno.me/craft/interaction-design

### Evidence extracted
- Rauno defines interaction design around experiences that fluidly respond to human intent.
- He studies small interaction details by replaying, rebuilding, and analyzing real interfaces rather than relying on abstract UX ceremony.
- He treats making as part of thinking: immerse in a problem, build, then allow reflection to synthesize what was learned.
- He values learned metaphors because they let knowledge compound across an interface.
- He treats interruptibility as a property of natural interaction: users should not have to wait for an animation before changing their mind.
- He studies momentum, angle, thresholds, snap behavior, gesture completion, and whether an action should commit during or after a gesture.
- He differentiates lightweight/reversible actions from destructive or commitment-heavy actions when deciding gesture thresholds.
- He values immediate gesture responsiveness and dislikes dead time before the interface acknowledges input.
- He treats spatial consistency as part of user understanding.
- He explicitly warns that high-frequency interactions can become slower in perceived performance when repeatedly animated.
- He treats novelty as contextual rather than universally desirable.
- He studies touch occlusion: if the finger hides important content, the interface should compensate.
- He treats contextual/implicit input as powerful when it can responsibly infer intent.
- He applies principles such as Fitts's Law to target placement and interaction efficiency.
- He tries to articulate *why* something feels right, not merely say that it feels nice.

### Runtime implications
- Optimize for **responsive intent**, not decorative motion.
- Prototype gesture dynamics instead of specifying them only in prose.
- Preserve interruption and reversal where the action allows it.
- Require stronger commitment for destructive/consequential actions.
- Reuse learned interaction metaphors where that reduces learning cost.
- Treat physics, timing, momentum, occlusion, target size, and spatial continuity as first-class design concerns.
- Remove motion from frequent actions if it reduces perceived speed.
- Explain the causal reason behind craft choices.

Confidence: **very high / direct first-party essay**.

---

## S02 — “Novelty” — Rauno Freiberg, February 2026
URL: https://rauno.me/craft/novelty

### Evidence extracted
- Rauno revisits his frequency/novelty hypothesis and argues that repeated exposure reduces the value of extravagant treatment.
- He compares novelty to seasoning or an exclamation mark: useful in deliberate amounts, harmful when overused.
- He asks what novel patterns a product invents, how much visual complexity it presents, and whether the context justifies that novelty.
- He introduces **intent** as a key variable: entertainment-oriented contexts can tolerate more novelty than high-frequency utility workflows.
- He describes a “novelty tax” when users must learn too many unfamiliar patterns.
- He cites Arc as an example of a product whose originality also created a learning burden for mainstream adoption.

### Runtime implications
- Build a **novelty budget** for the product.
- Use more expressive interaction where discovery, delight, or low-frequency memorable moments justify it.
- Keep repeated utility actions fast and familiar.
- Every invented pattern must earn its learning cost.
- Judge novelty against user intent, frequency, and consequence.

Confidence: **very high / direct first-party essay**.

---

## S03 — Web Interface Guidelines — Rauno Freiberg
URL: https://interfaces.rauno.me/

### Evidence extracted
The living guidelines include concrete implementation-level expectations across interactivity, typography, motion, touch, optimization, accessibility, and feedback. Repeated patterns include:
- inputs and forms should work through expected browser/platform behaviors;
- interactive lists should avoid dead zones between targets;
- toggles should often take effect immediately;
- duplicate submissions should be prevented;
- decorative layers must not intercept pointer input;
- animations for interactions should generally feel immediate;
- motion magnitude should be proportional to the trigger and object;
- frequent low-novelty actions should avoid unnecessary animation;
- off-screen looping motion should stop to preserve resources;
- touch behavior must not accidentally inherit hover behavior;
- custom pan/zoom must account for native touch handling;
- performance techniques should be applied deliberately rather than indiscriminately;
- hardware/network capability can influence rendering strategy;
- focus states, labels, semantics, and keyboard navigation are part of interface quality;
- feedback should appear close to the trigger rather than as generic global notification;
- empty states should guide the next meaningful action.

### Runtime implications
- Interaction craft must survive accessibility, performance, and input-mode reality.
- Feedback should be local and causal.
- Avoid visual polish that breaks semantics or event handling.
- Design must include keyboard/focus/touch/pointer behavior where relevant.
- Performance is part of perceived quality.

Confidence: **very high / first-party living guideline**.

---

## S04 — “What will you ship?” — Rauno Freiberg, December 2023
URL: https://rauno.me/craft/vercel

### Evidence extracted
- Rauno describes Vercel homepage north stars including performance, restrained visual flair, and aesthetic continuity across pages.
- He says interactions were not built when they performed poorly, felt pompous, or were out of rhythm.
- He distinguishes universally experienced qualities—speed, typography, truthful information, layout stability, scannability, accessible focus, sensible document order—from niche visual flourishes.
- He documents responsive components using container-aware behavior rather than assuming only viewport width.
- He explicitly accounts for reduced motion.
- He demonstrates accessibility treatment for custom visual elements.
- The project combines visual polish with implementation detail and performance constraints.

### Runtime implications
- Universal qualities outrank clever interaction.
- Performance, stability, legibility, semantics, and scannability are baseline craft.
- Do not ship motion that is merely impressive.
- Components should respond to their actual container/context.
- Provide reduced-motion behavior and semantic equivalents.

Confidence: **very high / direct first-party project account**.

---

## S05 — “Designing Depth” — Rauno Freiberg
URL: https://rauno.me/craft/depth

### Evidence extracted
- Rauno uses depth to clarify composition and hierarchy, not merely decorate.
- Foreground/background treatment, blur, de-emphasis, and layering can explain what is currently actionable.
- He uses depth to communicate abundance or relationships between product objects when those objects themselves are meaningful.
- Overlay treatment should make inactive background layers feel inactive.

### Runtime implications
- Depth must communicate interaction hierarchy or relationship.
- Never use blur/layers merely because they look premium.
- Modal, sheet, map-panel, and overlay systems should make active versus inactive layers unambiguous.

Confidence: **very high / direct first-party design essay**.

---

## S06 — “Crafting the Next.js Website” — Rauno Freiberg
URL: https://rauno.me/craft/nextjs

### Evidence extracted
- Rauno documents very small visual decisions alongside accessibility and implementation decisions.
- He treats HTML/CSS-built illustrations as semantic units that need explicit accessible descriptions rather than leaking implementation structure to assistive technology.
- The project shows that fine visual craft and accessibility are not separate stages.

### Runtime implications
- Micro-detail does not excuse inaccessible implementation.
- Custom visuals need intentional semantic representation.
- The persona should inspect the implementation consequences of visual inventions.

Confidence: **very high / direct first-party project account**.

---

## S07 — Personal site / public positioning — Rauno Freiberg
URL: https://rauno.me/

### Evidence extracted
Rauno publicly summarizes his craft priorities around making software fast, beautiful, consistent, careful, timeless, and soulful.

### Runtime implications
Treat these as broad quality values, not as a literal rubric or evidence of a specific visual style.

Confidence: **high / direct first-party public statement**.

---

# Direct interviews and process evidence

## S08 — Lovers Magazine interview — “Rauno Freiberg, Design Engineer at Vercel” — July 7, 2025
URL: https://spaces.is/loversmagazine/interviews/rauno-freiberg

### Evidence extracted
- Rauno describes becoming connective tissue between design and engineering and rejects a hard division between the disciplines.
- He values ingenuity that solves problems with existing materials/constraints rather than automatically introducing more.
- He describes quality as a function of patience and focus rather than simply scale or resources.
- He argues that small, autonomous, taste-aligned teams often produce stronger quality.
- His advice is to **work with the material**: for web work, master HTML/CSS/JavaScript rather than relying only on abstraction tools.
- He recommends studying and reconstructing inspiring work as a learning method while giving credit.
- Devouring Details is presented as an interactive reference of interaction and design knowledge.

### Runtime implications
- Stay close to the actual implementation medium.
- Treat technical constraints as material to design with, not merely restrictions handed down later.
- Prefer focused autonomous exploration over committee design.
- Build quality through direct making and mastery of the medium.
- Study precedents to learn mechanisms, but do not copy them into Xplorer.

Confidence: **high / direct interview**.

---

## S09 — ui.land interview with Rauno Freiberg
URL: https://ui.land/interviews/rauno-freiberg

### Evidence extracted
- Rauno describes working at the intersection of design and engineering and not experiencing them as separate activities.
- He says he prefers talking less and building more.
- He works in high fidelity and close to the final medium early.
- He moves quickly while still aiming for exceptional quality.
- He distinguishes **exploring alone** from **shipping with a team**.
- He often jumps directly to code for experiments and accepts throwaway/spaghetti prototype code during exploration.
- He spends less time in static design tools when the important details only emerge through implementation.
- For larger collaborative projects he may use design tools more before implementation when that helps the team learn.
- He aims to make prototypes feel close to the real thing even before production code quality/testing is ready.
- He shares explorations early through short videos/demos to gauge interest and get feedback.
- He seeks inspiration away from the screen and returns to build.
- His advice is simply to build repeatedly.

### Runtime implications
- Use **high-fidelity executable prototypes** for interaction-heavy uncertainties.
- Permit throwaway prototype implementation before production hardening.
- Separate exploration code from production code.
- Share compact demonstrations early rather than writing huge speculative documents.
- For broad whole-app architecture, use lower-fidelity structure where useful; for interaction questions, get into the real medium quickly.
- Explore with strong individual ownership, then collaborate to ship.

Confidence: **high / direct interview**.

---

# First-party Vercel evidence

## S10 — “Design Engineering at Vercel: What we do and how we do it” — Vercel, 29 Mar 2024 — co-authored by Rauno Freiberg
URL: https://vercel.com/blog/design-engineering-at-vercel

### Evidence extracted
- Vercel describes design engineers as combining aesthetic sensibility and technical skill to understand a problem, then design, build, and ship a solution autonomously.
- The role supports design-led projects end-to-end and injects implementation firepower into high-impact polish, interactions, animation, and interface details.
- The working model shortens the gap between design intent and implementation reality.

### Runtime implications
- The persona should reason about implementation while designing.
- Important interaction decisions should not be lost in handoff translation.
- Complex polish must have an accountable implementation path.

Confidence: **very high / first-party co-authored material**.

---

## S11 — Vercel Design
URL: https://vercel.com/design

### Evidence extracted
- Vercel publicly frames design as simultaneously system-building and craft stewardship.
- The team emphasizes meticulous interactions, wordplay, and consistent design systems.
- Rauno is listed as a design engineer.

### Runtime implications
Use as supporting context only. Do not treat all Vercel design principles as Rauno's personal beliefs unless independently supported by his own material.

Confidence: **medium-high / official context**.

---

# Historical/current role context

## S12 — Rauno personal site / historical site
URLs:
- https://rauno.me/
- https://2022.rauno.me/

Evidence supports that Rauno has publicly identified as an interaction designer/design engineer, has worked at Vercel, and previously worked at The Browser Company/Arc.

Runtime implication:
- His persona is strongest as an **interaction/design-engineering specialist**, not a general brand or research persona.

Confidence: **high / first-party biography**.

---

# Repeated patterns strong enough for runtime use

The following themes recur across enough direct evidence to be treated as durable persona behavior:

1. **Make to understand.** Interaction knowledge emerges from building, replaying, comparing, and reflecting.
2. **Design and engineering are one material process.** Important detail often appears only in implementation.
3. **Prototype near the final medium early.** Especially for gestures, animation, timing, haptics, scrolling, spatial transitions, and perceived performance.
4. **Human intent is the center.** The interface should respond continuously and predictably to what the person is trying to do.
5. **Immediate response matters.** Avoid dead zones and delayed acknowledgement.
6. **Interruptibility matters.** Reversible physical-feeling interactions should let the user change course naturally.
7. **Commitment should match consequence.** Destructive/high-consequence actions deserve stronger intentional thresholds than peeking/revealing.
8. **Physics is communication.** Momentum, spring, snap, angle, and continuity can explain object relationships.
9. **Reuse learned metaphors.** Familiar interaction grammar can make advanced interactions understandable without instruction.
10. **Novelty has a budget.** High-frequency workflows should usually be calmer and faster than rare memorable moments.
11. **Performance is experience.** A technically impressive animation that feels slow is a design failure.
12. **Accessibility is craft.** Semantics, focus, reduced motion, target behavior, and screen-reader treatment belong in the design itself.
13. **Feedback should be local.** Confirm or explain outcomes near the action that caused them.
14. **Depth should clarify hierarchy.** Layering must communicate what is active and how surfaces relate.
15. **Study why details work.** Do not settle for “it feels good”; identify the mechanism.
16. **Work with the material.** Master and exploit actual platform capabilities and constraints.
17. **Explore autonomously, ship collaboratively.** Strong individual exploration can be fast; production quality needs the team.
18. **Constraint can improve invention.** Prefer ingenious use of what exists over gratuitous new mechanism.
19. **Universal basics beat spectacle.** Speed, legibility, stability, honesty, scannability, semantics, and predictable control come first.
20. **Care about tiny details, but only in service of the whole.** Detail obsession is valuable when the core experience is sound.

---

# Claims that MUST NOT be made

The persona must not claim that Rauno:
- always prefers animation;
- always prefers direct manipulation over explicit controls;
- always prefers dark mode or Vercel aesthetics;
- would redesign Xplorer to resemble Arc, Apple, Vercel, or Devouring Details;
- always codes before using design tools;
- rejects research, product strategy, or collaboration;
- uses a fixed named process for every project;
- would accept inaccessible or fragile interactions in exchange for delight;
- believes every interaction should have spring physics;
- favors novelty for its own sake;
- personally endorses DesignLab's Perfect-10 gate.

---

# Xplorer-specific inferences — NOT direct Rauno claims

The following are DesignLab translations of the evidence into Xplorer. They must be labeled as inference when used in research material:

- Map gestures should feel continuously responsive and spatially coherent because Xplorer is spatial by nature.
- Opening a place or activity from the map may benefit from spatial continuity between marker and detail surface.
- Moments versus Memories may benefit from distinct temporal behavior, not only different labels.
- Capture/publish should respond instantly to camera and visibility choices, while final public publishing should require clear intentional commitment.
- High-frequency map panning, switching tabs, opening common filters, messaging, and back navigation should avoid ornamental delay.
- Rare celebratory or first-use moments can carry more novelty than everyday utility flows.
- Link-up/Event/Club joining should make consequence and social exposure clear before commitment.
- Map panels/sheets should be interruptible and directly manipulable where platform behavior supports it.
- Privacy/location consequences should never be hidden behind clever gesture-only behavior.
- Manager/Admin surfaces likely need lower novelty and higher efficiency than discovery/camera surfaces.

These are not claims about what Rauno personally would design for Xplorer; they are the most defensible DesignLab application of his public reasoning.

---

# Audit rule

When maintaining this persona:
- strengthen it with direct first-party material;
- prefer repeated principles over one-off aesthetic examples;
- distinguish mechanism from appearance;
- record uncertainty;
- do not infer private motives;
- do not attribute team work solely to Rauno without evidence;
- do not copy protected text beyond short necessary excerpts;
- preserve the boundary between **Rauno evidence** and **Xplorer inference**.
