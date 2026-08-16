# Grounded Xplorer — Katie Dill reasoning-lens candidate

## Product thesis
Xplorer becomes one coherent local-experience service: understand what is around you, judge whether it is right for you, act with confidence, retain the context you need in the real world, and return afterward to communication, reputation or memory without confusing live presence with history.

## Main thing
The highest-quality experience is the transition from **discovery → understanding → trust → commitment → real-world action**. The interface should shorten uncertainty, not merely shorten taps.

## Experience architecture
The candidate models Xplorer as nine connected moments: before, discover, consider, trust, commit, prepare, arrive/participate, complete, remember/follow up. Existing product domains remain intact inside that journey rather than being flattened into one generic object model.

### Persistent navigation
The frozen five destinations remain: News Feed, Messages, raised Map/Camera, Leaderboard and Profile. The candidate calms their visual treatment and preserves Map as the geographic centre. When already on Map, the centre control remains Camera; the existing Discover gesture/fallback remains product truth.

### Map
Map remains a decision surface, not decoration. Search and controls use human questions (what are you looking for, when does it matter, what should the map show) rather than internal filter language. Existing map semantics, heat privacy, approximate public location behaviour, Memory map window and MapLibre implementation are unchanged.

### Discover
Recommendation reason becomes first-class evidence. Cards give more room to title, type, relevance reason and next action, helping a person imagine the experience before opening a detail page. No recommendation data is invented.

### Social / identity
Every person remains an Explorer. Profiles, reviews, reputation, connections, Moments and Memories remain distinct. Reputation is treated as evidence for confidence, not a guarantee of safety. Friend remains mutual follow; Close Friend remains an owner-private subset of actual friends.

### Participation
Link-ups, Clubs, Events, Live and Check-ins remain separate concepts because their time, lifecycle and commitment differ. Presence remains temporary, public-place check-ins remain constrained, and one-way follows never widen presence.

### Communication
Messages remains one hub with Friends, Managers/listing conversations and Message Boards as views/gateways. The design preserves why a conversation exists so the user can understand the relationship before acting.

### Creation
Moment and Memory creation remain camera-first. The old generic create hub is not restored. The second-stage create routes retain their real meaning, audience and lifecycle differences.

### Places and management
Businesses, properties and public places keep their existing distinctions. Claims, self-created management, verification and reviews remain separate product truths. Manager remains an Explorer capability—not a second identity—and the four supported capability families remain businesses, properties, activity clubs and events.

### Admin
Admin surfaces stay operational and authorised. They are not promoted into the Explorer journey. Backend/RLS remains the real security boundary.

## Trust model
At decision moments the UI prioritises the evidence already available for person, place, activity, time, commitment, visibility and safety. It does not imply precise live location, automatic safety, public board access, universal Manager permissions or fictional real-time knowledge.

## Visual system
The proposal removes heavy print-like borders and hard shadows from high-frequency shared surfaces, increases breathing room, strengthens content hierarchy and uses the existing Xplorer semantic colour system rather than introducing a persona-branded palette. Semantic map/state colours are never repurposed as decoration.

## Interaction and motion
Continuity matters more than spectacle. Existing gestures and navigation behaviour are retained where they encode product truth. Critical functionality continues to have visible alternatives; reduced-motion and accessibility expectations remain part of the gate.

## State strategy
The candidate is required to preserve loading, empty, no-results, error/retry, slow-network, signed-out, unauthorised/private, permission-denied, location-unavailable, pending/approved/rejected/removed, capacity/full, expired/cancelled, unread/read, missing imagery, long content, keyboard-open, reduced-motion, screen-reader/non-map alternative, destructive confirmation and server-write-pending states.

## Technical realism
The implemented candidate intentionally concentrates change in shared experience surfaces and the global visual language. It does not alter services, Supabase/RLS, permission functions, audience logic, routing rules, map-state derivation, creation forms, account model or manager/admin security boundaries. This keeps the redesign implementable against the frozen Xplorer architecture and makes Product Truth regression mechanically testable.

## Three deliberate trade-offs
1. **No radical IA rewrite:** preserving the proven 76-route architecture reduces novelty but avoids inventing a new product model before user evidence justifies it.
2. **No persona-specific colour signature:** semantic map and state meaning matters more than visual authorship.
3. **No engagement theatre:** the candidate does not add streaks, nudges or extra post-experience loops; successful real-world action can mean less time in the app.

## Validation hypothesis
The candidate is better if a user can more quickly answer: What is this? Why is it relevant? What happens if I act? Who can see me? How do I get there or communicate? What happens afterward? Those questions should be tested in real moderated journey research after the tournament.
