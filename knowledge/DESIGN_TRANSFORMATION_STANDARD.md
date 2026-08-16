# Design Transformation Standard — Tournament B v2

## Purpose
This standard exists because a candidate can preserve every Xplorer capability, pass every technical test, and still fail as a design challenger by feeling like the existing app with cleaner styling. From Challenger 2 onward, that is an automatic failure.

Product Truth protects what Xplorer **does**. It does not protect how the current interface **looks, groups, composes, presents, prioritises, navigates or feels**.

## Core rule
A challenger must create a genuinely new, coherent Xplorer product design from its own research-backed persona reasoning. It may preserve an existing UI decision only when the persona independently concludes that the existing answer is best for the user/product. Existing UI is evidence, not a template.

The following are locked:
- product capabilities and 76-route coverage;
- Explorer identity and Manager capability model;
- permissions, privacy, ownership, audience and safety rules;
- existing data and backend realities;
- camera-first Moment/Memory creation;
- current entity distinctions and real state transitions;
- technical/platform constraints required by Product Truth.

The following are explicitly **not** locked:
- colour palette and visual identity;
- typography hierarchy;
- spacing/rhythm;
- card/list/surface language;
- information density;
- page composition;
- navigation presentation and discoverability;
- hierarchy and grouping;
- icon treatment;
- imagery treatment;
- map controls, overlays and contextual surfaces;
- motion language;
- forms, loading, empty, error and permission-state presentation;
- the arrangement of capabilities inside a route, provided capabilities survive;
- IA organisation, provided every real capability remains reachable and understandable.

## Mandatory pre-code outputs
Before implementation, every challenger from Alex Schleifer onward must create:
1. **Product Model** — what Xplorer is, its major user outcomes and service loops.
2. **Journey Model** — intent → orientation → evaluation → commitment → transition → live experience → reflection.
3. **Design Thesis** — one governing sentence and the tradeoffs it implies.
4. **Design System Definition** — its own palette, type hierarchy, spacing, surfaces, controls, navigation, feedback, state and motion rules.
5. **Structural Plan** — how the major screen families are recomposed rather than merely reskinned.

No implementation may begin from “change the existing colours/components.” It must begin from the challenger’s product model.

## Mandatory major screen families
A whole-app candidate must materially redesign the composition or interaction model of at least these ten families:
- Map;
- Discover;
- Feed;
- Messages;
- Explorer Profile;
- Link-ups / Live;
- Activity Clubs;
- Events;
- Manager / listing operations;
- Admin / operational surfaces.

Auth, settings, forms, reviews, claims, details and supporting routes must inherit the same system so the result is one coherent product rather than ten hero screens.

## New-design gate
A candidate fails automatically if a reasonable reviewer could summarise it as any of the following:
- “the same app with nicer colours”;
- “the same layout but simplified”;
- “a reskin”;
- “the old app with rounded cards / different spacing”;
- “hero screens changed, rest of product unchanged.”

Passing requires visible and evidenced change across **all** of these dimensions:
1. Visual identity.
2. Navigation presentation.
3. Page composition.
4. Information hierarchy.
5. Component/surface language.
6. Interaction/state presentation.
7. Map experience.
8. Cross-route system coherence.

At least six of the eight must be rated **major transformation** and none may be rated **unchanged**.

## Palette independence
The challenger must define its palette from its own product reasoning. Reusing a frozen-app colour is allowed only when there is a semantic/accessibility/product reason. Reusing the existing palette wholesale or using it as the default starting point fails.

## Structural delta
At least eight of the ten mandatory screen families must contain a documented structural difference from frozen Xplorer, such as:
- new grouping/order of information;
- new primary/secondary action hierarchy;
- different navigation/context model;
- different list/card/detail composition;
- different map-to-detail handoff;
- different progressive-disclosure strategy;
- different state presentation;
- different content density/rhythm.

A structural delta must change how the user understands or moves through the product, not merely border radius, colour, shadow or spacing.

## “Same design?” test
Before APK compilation, answer:
> If the old Xplorer and this candidate were shown side-by-side with logos removed, would a normal user immediately recognise two distinct product-design systems?

The only passing answer is **yes**, with evidence.

## Source implementation evidence
Before APK compilation, the candidate branch must prove:
- it descends directly from the frozen Xplorer commit, not another challenger;
- protected backend/privacy/permission logic remains untouched;
- the new design system exists as an implementation system, not just prose;
- major consumer and operational screen families use it;
- the diff includes substantive changes outside only the global header/tab bar/theme files.

## Required DESIGN_DELTA.json for Challengers 2–7
The deterministic candidate lock must include a `DESIGN_DELTA.json` containing:
- `schemaVersion: 1`;
- challenger slug and frozen source commit;
- `sameDesign: false`;
- eight dimension records using the dimensions above;
- each dimension rating: `major` or `moderate`, never `unchanged`;
- at least six `major` ratings;
- at least ten screen-family records;
- at least eight screen families with `structuralChange: true`;
- concrete evidence for every rating;
- a palette-independence statement;
- an explicit statement that the candidate was designed from the persona product model rather than by restyling frozen Xplorer.

Self-assertion alone is not sufficient: the whole-app prototype, design thesis and implementation diff must support the claims.

## APK compilation rule
APK compilation is a delivery step, not a design-validation step. It begins only after:
1. Product Truth gate passes;
2. Design Transformation gate passes;
3. whole-app prototype is visually/structurally distinct;
4. major routes are browser-validated;
5. Perfect-10 passes.

Once compilation is handed to GitHub Actions, the design/orchestration process immediately moves on to the next independent challenger. Waiting for Gradle is not part of design work.

## Independence rule
Every challenger starts from the exact same frozen Xplorer source and shared Product Truth. No challenger may inherit another challenger’s design, code, palette, layout, thesis or component system.
