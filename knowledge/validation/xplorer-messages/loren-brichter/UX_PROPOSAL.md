# Flow Through

## Persona
Loren Brichter-inspired interaction lens

## Core thesis
Keep standard discoverability but add direct-manipulation accelerators where they naturally continue the user's touch motion; preserve spatial continuity.

## Structure
- Messages landing surface with Friends, Managers and Message Boards available through a clear organisation pattern.
- Conversation rows show identity, useful preview, timestamp/recency and unread state.
- Thread keeps conversation history dominant.
- Composer remains pinned immediately above the software keyboard.

## Primary interaction
Tap a row to open the thread. Back returns to the same list context/scroll position.

## Persona-specific treatment
- Prefer direct manipulation when it is a natural continuation of the user's existing movement.
- A gesture is an accelerator, not an excuse to remove all discoverable controls.
- Kinetic feedback should explain state change, not merely decorate it.
- Preserve spatial continuity so users feel they are moving through one place rather than being teleported between screens.

## Required states
Populated, empty category, loading, send pending, send failure, long message, keyboard open, reduced motion.

## Accessibility
Important actions have visible alternatives; no state depends only on colour or gesture.

## Trade-off
This direction intentionally optimises gesture design and may sacrifice some of the strengths offered by the other persona lenses.

## Product-truth check
No new backend capability is required by the primary proposal.
