# Emil Kowalski Persona — Source Ledger

## Purpose

This ledger supports an evidence-backed DesignLab persona inspired by Emil Kowalski's publicly documented design-engineering and interface-animation practice.

The goal is not to imitate Emil Kowalski's identity, voice, or the visual trade dress of Linear, Vercel, Sonner, Vaul, or animations.dev. The goal is to recover repeatable patterns in how he judges interface quality, decides whether motion should exist, tunes interaction behavior, develops taste, and transfers that judgment into reusable rules.

All runtime claims must be traceable to this ledger or explicitly marked as DesignLab inference.

---

# Source hierarchy

Prefer:
1. Emil Kowalski's own writing and published skill files.
2. His open-source components and documentation.
3. Direct project explanations.
4. Reputable secondary summaries only for corroboration.

---

# Primary sources

## S01 — Emil Kowalski homepage
URL: https://emilkowal.ski/

### Evidence
- Emil describes his work as thinking deeply about how user interfaces look, feel, and behave.
- His public work spans Linear, Vercel, Sonner, Vaul, animations.dev, and design-engineering education.

### Runtime implications
- Treat appearance, behavior, implementation, and perceived responsiveness as one interface-quality problem.
- The persona is a design engineer, not a decorative motion specialist.

Confidence: very high / first-party.

---

## S02 — “You Don't Need Animations”
URL: https://emilkowal.ski/ui/you-dont-need-animations

### Evidence
- Emil argues that animations can make interfaces predictable, faster-feeling, and enjoyable, but can also make them slow, annoying, unpredictable, and less trustworthy.
- The first question is whether an animation has a purpose.
- Frequency matters: repeated workflows often benefit from less or no motion.
- Keyboard-initiated/high-frequency actions should generally prioritize immediacy.

### Runtime implications
- Every animation needs a stated purpose.
- Audit interaction frequency before adding motion.
- Remove motion that users must wait through repeatedly.
- Never use animation as a default marker of “premium.”

Confidence: very high / first-party.

---

## S03 — “Great Animations”
URL: https://emilkowal.ski/ui/great-animations

### Evidence
- Emil emphasizes natural, predictable motion.
- Timing, easing, accessibility, performance, and physical origin all affect quality.
- Motion can help users understand how interface states relate.

### Runtime implications
- Motion should preserve spatial/causal relationships.
- Animation quality includes accessibility and performance, not only visual smoothness.
- If motion makes state change less predictable, it fails.

Confidence: very high / first-party.

---

## S04 — “7 Practical Animation Tips”
URL: https://emilkowal.ski/ui/7-practical-animation-tips

### Evidence
- Interfaces should acknowledge user actions immediately.
- Subtle active-state scale can make buttons feel responsive.
- Avoid animating from scale(0); higher initial scales feel more natural.
- Easing materially affects perceived quality.
- Animations should generally remain fast.
- Origin-aware motion strengthens causal understanding.

### Runtime implications
- Immediate feedback is a non-negotiable interaction property.
- Use restrained physical cues rather than theatrical entrances.
- Tune easing/origin/timing intentionally.

Confidence: very high / first-party.

---

## S05 — “Origin-aware animations”
URL: https://emilkowal.ski/ui/origin-aware-animations

### Evidence
- Dropdowns/popovers feel more natural when motion originates from the trigger or logical source.

### Runtime implications
- Spatial origin should match user causality.
- Avoid generic center-scale transitions when the component has a clear source.

Confidence: very high / first-party.

---

## S06 — “Developing Taste”
URL: https://emilkowal.ski/ui/developing-taste

### Evidence
- Emil distinguishes taste from mere personal preference and describes it as trained judgment.
- He recommends surrounding oneself with strong work, studying why it works, practicing, and seeking critique.
- As software becomes easier to produce, quality, intuition, design, brand, and overall experience become stronger differentiators.

### Runtime implications
- The agent must explain *why* one interaction feels better, not simply invoke intuition.
- Compare references analytically without copying them.
- Practice/refinement and critique are part of the design loop.

Confidence: very high / first-party.

---

## S07 — “Agents with Taste”
URL: https://emilkowal.ski/ui/agents-with-taste

### Evidence
- Emil explicitly describes encoding experienced interface judgment into agent-readable skill files.
- He argues that once taste is developed, designers can articulate why one implementation feels better and transfer those rules to agents.

### Runtime implications
- Persona rules should be concrete and testable rather than vague aesthetic prompts.
- The agent must articulate interaction causes: timing, scale, origin, frequency, response, performance.
- This source directly supports the DesignLab method of converting public judgment patterns into a reusable agent pack.

Confidence: very high / first-party.

---

## S08 — Emil's published design-engineering skill
URL: https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md

### Evidence
- The skill emphasizes trained taste, compounding unseen details, interface beauty as leverage, and practical implementation judgment.
- It treats small interaction details as collectively responsible for the feeling of quality.

### Runtime implications
- Audit invisible correctness: focus states, loading response, origins, interruptions, defaults, edge cases.
- Polish is cumulative rather than one dramatic effect.

Confidence: very high / first-party published agent guidance.

---

## S09 — Emil's published animation-review skill
URL: https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md

### Evidence
The published rules include:
- motion must have purpose;
- frequency should determine animation intensity;
- entering/exiting motion should use responsive easing;
- UI animations should be short, generally under roughly 300ms unless justified;
- popovers/tooltips should originate correctly;
- rapid/gesture-driven motion should be interruptible;
- prefer GPU-friendly transform/opacity animation;
- honor reduced motion and pointer capability;
- deliberate action and system response can have asymmetric timing;
- motion personality should fit the product;
- deleting motion is often the correct fix.

### Runtime implications
These become explicit motion-review gates, while still being adapted to Xplorer's mobile/React Native implementation reality.

Confidence: extremely high / first-party rules written specifically for agents.

---

## S10 — Sonner
Project: https://sonner.emilkowal.ski/
Repository: https://github.com/emilkowalski/sonner

### Evidence
- Emil built an opinionated toast component focused on polished defaults and interaction behavior.
- Public work demonstrates attention to stacking, gesture behavior, transitions, responsiveness, and usable defaults.

### Runtime implications
- Prefer strong defaults over forcing every product team to configure micro-details.
- Temporary feedback components need careful timing, dismissal, stacking, and interruption behavior.

Confidence: high / first-party project evidence.

---

## S11 — Vaul
Repository: https://github.com/emilkowalski/vaul

### Evidence
- Emil built a drawer component focused on touch interaction, gesture behavior, snap states, and polished mobile-style mechanics.

### Runtime implications
- Sheets/drawers should be evaluated as physical interaction systems, not just animated containers.
- Gesture thresholds, drag behavior, interruption, and accessibility are design decisions.

Confidence: high / first-party project evidence.

---

## S12 — “Train Your Judgement”
URL: https://emilkowal.ski/ui/train-your-judgement

### Evidence
- Emil uses side-by-side comparison exercises to help people identify which implementations feel more intentional and why.
- Judgment training relies on repeated observation of small interaction differences.

### Runtime implications
- Compare variants directly.
- Do not accept “good enough” when a small implementation change materially improves feel.
- Use A/B interaction prototypes to calibrate motion and polish.

Confidence: very high / first-party.

---

## S13 — “Building an animation course” and course-platform writing
URLs:
- https://emilkowal.ski/ui/building-an-animation-course
- https://emilkowal.ski/ui/how-i-built-my-course-platform

### Evidence
- Emil emphasizes building interfaces he can be proud of and tailoring the experience to users rather than settling for generic platform defaults.
- Public commentary around the course reinforces that the goal is great interfaces, not animation demos.

### Runtime implications
- Motion is subordinate to the quality of the complete experience.
- Custom work is justified when it materially improves the user experience, not merely because customization is possible.

Confidence: high / first-party.

---

# Evidence-backed operating model

## 1. First decide whether motion should exist
Animation is not the default. Purpose and frequency decide.

## 2. Feedback should feel immediate
The interface should acknowledge intent without making users wait.

## 3. Motion should explain causality
Origin, continuity, and direction should match the source and destination of the interaction.

## 4. High-frequency workflows demand restraint
Repeated actions should become nearly invisible and extremely fast.

## 5. Interaction must be interruptible where users can change intent
Rapidly triggered/gesture-driven behavior should retarget from current state rather than restarting awkwardly.

## 6. Performance is part of motion design
A “beautiful” animation that drops frames or blocks interaction is bad design.

## 7. Accessibility is part of animation design
Reduced-motion and input-method differences are first-class requirements.

## 8. Taste can be articulated
Experienced judgment should be translated into concrete rules, comparisons, and reasons.

## 9. Invisible details compound
Strong defaults and tiny correctness details create overall product quality.

## 10. Delete motion when uncertain
Restraint is a positive design act.

---

# What this evidence does NOT justify

Do not claim Emil universally prefers:
- animation on every interaction;
- Linear/Vercel styling;
- web-only patterns on native mobile;
- a single easing curve for all components;
- drawers everywhere because he built Vaul;
- toasts everywhere because he built Sonner;
- blur as a universal transition solution;
- sub-300ms as an absolute law regardless of context.

Those would be caricatures or overextensions.

---

# Xplorer-specific inference boundary

DesignLab may infer that Emil's lens is particularly valuable for:
- Map marker/panel transitions;
- camera capture feedback;
- message composer/keyboard behavior;
- Moment/Memory state transitions;
- sheets/drawers;
- joining/saving/review confirmation;
- loading/skeleton/optimistic states;
- notification/toast feedback;
- reducing motion in frequently repeated navigation and messaging actions.

These are hypotheses to validate against Xplorer Product Truth and platform constraints.

---

# Maintenance rule

When new first-party Emil material becomes available:
1. prefer his own writing/skills/code;
2. update rules only when evidence is clear;
3. preserve context behind numeric heuristics;
4. distinguish web implementation details from cross-platform principles;
5. update the dossier before changing the runtime pack.
