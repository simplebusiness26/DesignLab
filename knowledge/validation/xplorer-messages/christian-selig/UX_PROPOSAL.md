# Native Power Inbox

## Persona
Christian Selig-inspired native-app lens

## Core thesis
Start from a platform-familiar list/thread model, then progressively expose swipe/context shortcuts and power-user organisation without making them mandatory.

## Structure
- Messages landing surface with Friends, Managers and Message Boards available through a clear organisation pattern.
- Conversation rows show identity, useful preview, timestamp/recency and unread state.
- Thread keeps conversation history dominant.
- Composer remains pinned immediately above the software keyboard.

## Primary interaction
Tap a row to open the thread. Back returns to the same list context/scroll position.

## Persona-specific treatment
- Start from the platform's familiar mental model; earn deviations with clear value.
- Expose power progressively: defaults should work immediately, while frequent users can discover shortcuts and customization.
- Polish is the accumulation of small correct behaviors—keyboard movement, safe areas, gestures, transitions, context menus and state restoration.
- New platform capabilities are opportunities only when they fit the product's purpose.

## Required states
Populated, empty category, loading, send pending, send failure, long message, keyboard open, reduced motion.

## Accessibility
Important actions have visible alternatives; no state depends only on colour or gesture.

## Trade-off
This direction intentionally optimises native conventions and may sacrifice some of the strengths offered by the other persona lenses.

## Product-truth check
No new backend capability is required by the primary proposal.
