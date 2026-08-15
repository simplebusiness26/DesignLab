# Xplorer Messages UX Tournament — Round 2 Calibration

## Status

**AWAITING USER REVIEW.** No UX winner has been selected, no synthesis has been performed, and the visual tournament has not started.

## Why Round 2 exists

Round 1 passed the Product Truth, privacy, accessibility, and anti-invention gates, but it failed an important user-facing quality bar: the four prototypes felt too conservative, too similar, and not recognisably tied to their design lenses.

The Round 1 result is therefore recorded as:

**REJECTED BY USER FOR INSUFFICIENT PERSONA DISTINCTIVENESS — technically valid, experientially too generic.**

This is not a failure of Product Truth. It is a calibration failure in how strongly persona reasoning was expressed in the interactive UX.

## Permanent acceptance rule added

Product Truth is necessary but insufficient.

A tournament proposal must be recognisably attributable to its design lens **before the viewer reads the persona label**. Distinctiveness must survive removal of names, explanatory copy, and superficial colour treatment. It should be visible in the information architecture, interaction model, motion/spatial model, state handling, density, control strategy, feedback, and trade-offs.

A proposal fails the persona-distinctiveness gate when it is essentially a generic competent interface with persona-flavoured styling or copy.

This rule does **not** permit feature invention. Stronger persona expression must remain inside the same verified Product Truth and permissions.

## Round 2 Product Truth boundary

All four directions continue to preserve the same Xplorer Messages contract:

- One Messages inbox.
- Views: All / Friends / Managers / Message Boards.
- Friends are `kind=friend` direct conversations.
- Managers are `kind=listing` direct conversations; Manager remains a capability/context, never a separate identity or account type.
- Message Boards remain gateways to existing board systems rather than a fourth DM backend.
- Board loading can fail independently without destroying direct conversations.
- Sending permissions are rechecked; a lost relationship/listing permission can block future sending without erasing history.
- Deliberate upward history reading is not auto-yanked to the latest message.
- Composer behaviour remains keyboard-safe.
- No new messaging backend, fake Manager identity, merged board/DM data model, gesture-only critical action, or privacy weakening is introduced.
- Accessibility and reduced-motion requirements remain in force.

## Round 2 directions

### 1. Ocho / grug — Pocket Campfire

Persona expression is pushed through tactile, handmade-feeling message objects, low stimulation, friendly hierarchy, small physical feedback, and boards presented as understandable doorways rather than another technical message type.

Distinctive principle: **make messaging feel like a small human place, not a dashboard.**

### 2. Jordan Singer — Message System

Persona expression is pushed through reusable state-driven modules, visible counts, deterministic grouping, contextual metadata, explicit source/state behaviour, and a thread state rail showing availability, history-reading, sending, and permission state.

Distinctive principle: **the UX and the underlying system model should visibly reinforce each other.**

### 3. Loren Brichter — Thumbline

Persona expression is pushed through direct manipulation and spatial continuity: horizontal movement between views, row sliding with a visible tap-equivalent Open action, spatial row-to-thread transition, edge-swipe back with a visible Back control, and a latest-message affordance that does not interrupt deliberate history reading.

Distinctive principle: **the interface should feel like an object under the thumb rather than a stack of controls.**

### 4. Christian Selig — Native Power Inbox

Persona expression is pushed through first-party-native familiarity, polished grouped lists, predictable navigation, and optional power that does not burden the default experience: unread-only filtering, comfortable/compact density, and a native-style view-options sheet.

Distinctive principle: **familiar by default, unusually refined and powerful when the user asks for more.**

## Round 2 validation state

- Product Truth boundary: **retained for all four**.
- No-feature-invention rule: **retained**.
- Persona distinctiveness: **intentionally increased at the interaction/IA/state level rather than relying on labels or colour alone**.
- Standalone review: rebuilt from the four committed Round 2 prototype files with a script-free outer CSS tab switcher for Android reliability.
- User approval: **pending**.

## Next gate

The user reviews all four Round 2 prototypes and may:

1. select one,
2. combine specific parts,
3. request iteration on one or more,
4. reject all four again.

Do not synthesize the final UX and do not start the visual tournament until the user explicitly approves the UX direction.