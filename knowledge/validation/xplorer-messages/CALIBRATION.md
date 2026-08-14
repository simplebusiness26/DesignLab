# Xplorer Messages — UX Persona Calibration

## Status
**PASS — behavioural calibration on GPT-5.6 Sol**

This calibration deliberately does **not** claim a Sonnet run. The current DesignLab repository does not expose a callable Sonnet provider in this environment. The purpose of this run is to test whether the `persona-pack-v1.0-rc1` UX packs create materially different, product-truth-safe decisions under the same capable reasoning model.

## Source truth
Product source: `simplebusiness26/The-App`, branch `main2.0-Dev`.

### Feature packet
- One Messages inbox.
- Views: **All / Friends / Managers / Message Boards**.
- Friends = `kind=friend` direct conversations.
- Managers = `kind=listing` direct conversations. Manager is a capability/context, not a separate account identity.
- Listing rows can truthfully show `You manage <listing>` or `About <listing>` depending on which side the Explorer is on.
- Message Boards is a gateway to existing board systems, not a fourth DM backend.
- Existing board routes include Link-up boards and Activity Club message boards.
- Direct inbox and boards are loaded independently enough that a board-load failure must not destroy the direct inbox.
- Unread totals exist per direct-conversation view.
- Threads are protected by auth/RLS.
- `send_message` re-checks relationship/listing permission on every send.
- Ending a relationship can close future sending without erasing old history.
- The thread initially settles at the bottom, but deliberate upward reading must not be auto-yanked back down.
- The composer uses the measured keyboard inset so the keyboard does not cover it.

Hard constraints: no new messaging backend; no Manager account type; no merging board posts into direct-message tables; no gesture-only critical action; preserve privacy/permission behaviour; support scalable text, semantics, reduced motion, target sizes and contrast.

---

# Concept A — Quiet Postcards
**Lens: Ocho / grug**

### Core idea
Make Messages feel like a small, friendly place to continue conversations rather than a communications dashboard. Reduce visible competition and save delight for acknowledgement moments.

### Structure
- Messages header with a quiet total-unread count.
- Always-visible All / Friends / Managers / Boards choices.
- One calm vertical list without enclosing every row in a heavy card.
- Row hierarchy: identity → unread → recent message → relationship/listing context → time.
- Boards keep the same rhythm but clearly read as destinations into a board system.

### Interaction
- Tap view, tap row, type/send. No novelty gesture required.
- Very small tactile acknowledgement on meaningful transitions/send.
- Thread remains visually quiet; composer visibly follows the keyboard.
- Reading older history is treated as sacred: layout/new-message changes do not steal the scroll position.
- Send refusal is shown above the composer and the draft is preserved.

### Strength
Low stimulation, warmth and personality without changing the data model.

### Risk
Too much spacing can make a large inbox inefficient; hand-crafted character must never reduce legibility.

---

# Concept B — Context Router
**Lens: Jordan Singer**

### Core idea
Treat Messages as one reusable state-driven system. Existing metadata (`kind`, listing context, manager side, board kind/route) determines presentation rather than duplicating screens.

### Structure
- One inbox shell with a configurable view rail.
- One reusable inbox-item grammar renders friend, listing-context and board destinations.
- Fixed information slots: identity, context, preview, time, unread, destination type.
- Boards remain a separate data source/state inside the same shell.

### Interaction
- View definitions declare source, predicate, unread logic, empty copy and scoped error state.
- All/Friends/Managers visually behave like filters over one conversation collection.
- Boards uses a stronger transition because the source changes, but stays in the same Messages shell.
- Thread is explicitly modelled as loading → available → sending/error plus `readingHistory` and keyboard-inset state.

### Strength
The UX and implementation model reinforce each other, preventing identity drift and one-off UI logic as the app grows.

### Risk
Can feel more systematic than emotional; animated retained-row transitions should only survive if they add comprehension.

---

# Concept C — Thumbline
**Lens: Loren Brichter**

### Core idea
Make the list and thread the main physical objects. Increase scan speed, minimise persistent chrome and make direct manipulation/scroll behaviour feel genuinely mobile.

### Structure
- Compact Messages header.
- Visible view rail that can pin as the inbox begins.
- Denser rows optimised for rapid recognition: unread/name → preview → context → time.
- No second-level inbox navigation.

### Interaction
- Visible tap path remains primary.
- Optional horizontal row gesture can be prototyped only as a shortcut to an already-visible safe action; no archive/mute/delete is invented.
- Row→thread motion carries spatial continuity.
- Composer/keyboard behave as one physical unit.
- Deliberate history scrolling is elevated to a first-class interaction law; auto-scroll only occurs when the reader is already at/near bottom.

### Strength
Fastest scan/manipulation concept and the most explicitly mobile-native interaction proposal.

### Risk
Density may feel less calm; custom horizontal gestures can conflict with platform back navigation and may be rejected after testing.

---

# Concept D — Native Social Inbox
**Lens: Christian Selig**

### Core idea
Use immediately familiar native mobile patterns, then concentrate craftsmanship on the high-frequency details: row press, filter change, keyboard, composer, back navigation and message insertion.

### Structure
- Native-feeling Messages header.
- Familiar segmented/pill control for the four existing views.
- Platform-native list rhythm with full-row targets, avatar/title, preview/context and trailing time/unread.
- Listing context is secondary copy, never a badge implying another identity.

### Interaction
- Standard tap/filter/back/composer/send path.
- No custom gesture is required for core v1.
- Subtle pressed states/haptics and smooth outgoing-message insertion.
- Error state avoids destructive modal interruption where practical.
- Android/iOS implementation details may differ while the UX contract stays the same.

### Strength
Lowest learning cost and strongest platform predictability/accessibility posture.

### Risk
Less radical than the other directions; without a strong later visual pass it could become generic.

---

# Validation

## Product-truth gate
All four preserve the one-inbox model, the four existing views, listing-context meaning, separate board systems, permission re-checks, keyboard-safe composer and history-scroll behaviour. None invents a required new messaging feature or backend.

**PASS 4/4**

## Persona fidelity scores (1–5)
- Ocho: task clarity 5; systemic expressiveness 4; noise reduction 5; selective delight 4; accessibility viability 5.
- Singer: component/state awareness 5; reusable intelligence 4; understandable structure 5; scalability 5; implementation mapping 5.
- Brichter: primary actions 5; high-frequency speed 5; gestures enhance rather than gate 4; motion clarifies state 5; target-hardware viability 4.
- Selig: platform predictability 5; custom-control restraint 5; frequent-interaction polish 4; uncluttered first use 5; accessibility/system behaviour 5.

## Pairwise text distinctness
TF-IDF cosine similarity (lower = more distinct):
- Ocho ↔ Singer: 0.247
- Ocho ↔ Brichter: 0.242
- Ocho ↔ Selig: 0.226
- Singer ↔ Brichter: 0.212
- Singer ↔ Selig: 0.210
- Brichter ↔ Selig: 0.223

The remaining overlap is primarily shared Product Truth, required states, accessibility and the common output contract—not shared design logic.

## Anti-caricature gate
- Ocho does not collapse into scribbles/handwriting as a cosmetic skin.
- Singer does not add AI gimmicks to a non-AI messaging feature.
- Brichter does not blindly add pull-to-refresh or hidden gesture-only actions.
- Selig does not copy Apollo; it applies native familiarity/craft as transferable principles.

**PASS 4/4**

## Accessibility gate
All four preserve visible alternatives to gestures, scalable text, semantic view/row labels, non-colour-only unread state, reduced-motion paths, keyboard-safe composer, full target sizes and recoverable error states.

**PASS 4/4**

## Decision
The four UX persona packs are behaviourally differentiated enough to proceed to the lightweight prototype approval gate.

Keep the knowledge version labelled **`persona-pack-v1.0-rc1`** until the intended production model/provider is wired and this same fixture is rerun there. No persona-pack revision is required from the GPT-5.6 Sol calibration.

## Next gate
Present the four interactive UX prototypes to the user. Do **not** synthesise final UX or begin the visual-design tournament until the user has selected/combined the preferred UX decisions.