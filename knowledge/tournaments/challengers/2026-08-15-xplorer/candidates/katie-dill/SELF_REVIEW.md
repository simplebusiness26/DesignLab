# Katie Dill reasoning-lens self-review — Grounded Xplorer

## What this review is
This is a review through the research-backed Katie Dill reasoning lens. It is not a claim to represent Katie Dill personally. The candidate is judged on whole-service coherence, real-world usefulness, trust, product truth and craft rather than resemblance to any product or employer.

## Experience-model review
**What Xplorer is for:** help people understand local possibilities, coordinate socially where relevant, act in the real world, and retain appropriate memory/reputation afterward.

**The main thing:** the quality of the handoff from local discovery to a confident real-world decision.

**Highest-risk moments:** live/presence interpretation, joining strangers, visibility before posting/checking in, manager/listing relationships, board access, directions/arrival, and distinguishing a temporary Moment from a persistent Memory.

**What was preserved because it is structurally good:** Map as geographic centre; one Explorer identity; Manager as capability; mutual-follow friendship; camera-first Moment/Memory capture; one Messages hub; separate Link-up/Club/Event concepts; explicit audience vocabulary; database/RLS security; distinct claims and verification; semantic map colour rules.

**What prevented the original shell reaching its potential:** shared surfaces often presented internal mechanics before the human question, recommendation reason was visually secondary, high-frequency chrome was visually heavy, and Quick Access read more like a route catalogue than a service aid.

## Persona rubric
### A. Problem quality — 5/5
The candidate addresses uncertainty around discovery, trust, commitment and real-world handoff instead of treating the task as a reskin. Changes to Map controls, Discover reason hierarchy, Quick Access framing and shared navigation all trace to those human problems.

### B. Whole-journey coherence — 5/5
The proposal explicitly connects before → discovery → consideration → trust → commitment → preparation → participation → completion → memory/follow-up. The implemented app keeps all 76 routes and shared navigation intact, while the review prototype makes the whole route set navigable as one product.

### C. Trust — 5/5
No new safety promise or visibility model is invented. Existing verification, recency, permission, audience and presence rules remain authoritative. The candidate makes recommendation reasons and contextual meaning more prominent rather than manufacturing new trust badges.

### D. Real-world usefulness — 5/5
Map remains central; directions/communication/participation remain reachable through existing product paths; live presence stays approximate and temporary; the candidate does not add engagement loops that compete with the real-world goal.

### E. Information clarity — 5/5
Shared surfaces were reduced and rephrased around decisions, but no material capability was removed. Discover gives more space to relevance evidence. Quick Access groups service areas. Map controls use user language instead of filter taxonomy.

### F. Product truth — 5/5
The candidate descends from frozen source `78632b12eeb4e4123b1a767c8b815fe6617681f9`. Protected backend/permission/audience/map-routing/create surfaces were not changed. 926/926 Jest tests passed, all deterministic Xplorer verifiers passed, and all 76 routes rendered in the production browser bundle without uncaught error before the tested source was committed.

### G. Craft — 5/5
The candidate applies consistent spacing, border, card, hierarchy and typography decisions to the shared shell while preserving semantic colour meaning. The work deliberately avoids arbitrary brand colour or signature animation.

### H. Accessibility — 5/5
The existing contrast/accessibility gate remained enabled and passed. Critical functions were not moved into gesture-only affordances; the visible tab destinations remain. The design keeps product expectations for reduced motion, long content, keyboard, screen-reader semantics and non-map alternatives in the state contract.

### I. Technical realism — 5/5
The redesign is implemented in the real Expo/React Native source and was exercised through Jest, deterministic source verifiers, Expo web export, a real Chromium route sweep and Android prebuild. No fictional service, recommendation source, account type or messaging model was added.

### J. Originality — 5/5
The candidate does not reproduce Airbnb, Lyft, Stripe or another known product. The identity comes from journey architecture, trust emphasis, decision framing and careful service hierarchy, not borrowed trade dress.

## Weaknesses found and corrected
### 1. Footer boundary regression
The first implementation softened the persistent footer boundary from 2px to 1px. One of 926 tests failed because the raised centre action intentionally straddles that geometry. The candidate restored the 2px structural boundary while keeping the calmer treatment. The complete Jest suite then passed 926/926.

### 2. Expo Doctor patch drift
Expo Doctor reported one inherited baseline condition: seven SDK-57 packages were one patch behind the then-current recommendation. Tournament B requires the frozen dependency basis. The build gate was narrowed to allow only that exact patch-level advisory while still failing on any additional Doctor issue, minor mismatch or major mismatch. Dependencies were not silently upgraded per candidate.

### 3. Risk of becoming a cosmetic reskin
A shared-surface redesign can drift into styling-only work. The review therefore checks every decision against the Experience Model and the real journey: Map asks human questions, Discover elevates relevance evidence, Quick Access reframes route access around the plan, and the startup promise describes the service outcome. The Product Truth and route browser gates prove that this framing was added without replacing the product.

## Seven final checks
1. **Whole service:** PASS — all 76 routes remain represented and tested.
2. **Main thing:** PASS — discovery-to-real-world confidence is the organising principle.
3. **Trust:** PASS — visibility, presence, identity and capability rules are unchanged and surfaced carefully.
4. **Reality:** PASS — no new backend behaviour or fictional data is required.
5. **Caricature:** PASS — no Airbnb/Lyft/Stripe trade dress or copied flow.
6. **Off-screen:** PASS — Map, timing, communication and participation remain central to real-world action.
7. **Care:** PASS — shared surfaces, edge-state contract, tests and build pipeline were treated as one quality system.

## Remaining research, not a blocker
No new user study was fabricated for this candidate. The next evidence to collect after the tournament should be moderated tests of: (1) whether users understand Discover reasons, (2) whether live activity is understood as approximate rather than precise presence, (3) whether Link-up commitment feels sufficiently clear and safe, and (4) whether the calmer shared shell improves orientation without making important status less visible.
