# Xplorer Challenger Tournament B — Master Product Brief

Status: LOCKED SHARED INPUT
Tournament: Xplorer Challenger Tournament B
Source repository: `simplebusiness26/The-App`
Source branch at freeze: `main2.0-Dev`
Frozen source commit: `78632b12eeb4e4123b1a767c8b815fe6617681f9`
Companion truth file: `PRODUCT_TRUTH_ANNEX.md`
Machine-readable truth: `PRODUCT_TRUTH.json`

## 1. Why this brief exists

Every challenger must solve the same real product.

This brief tells a challenger what Xplorer is, what problem it is trying to solve, what product laws must survive, what may be redesigned, and what complete journeys must still work. It deliberately does **not** prescribe a visual style or a preferred solution.

The design task is not “reskin the current screens”. It is:

> Given everything Xplorer genuinely does at the frozen commit, what is the best coherent product experience this could become?

Product reality is fixed. Design expression is not.

## 2. Source-of-truth order

When sources disagree, use this order:

1. actual code at the frozen commit;
2. Supabase migrations and database security rules at that commit;
3. automated tests and verification gates;
4. `RULES.md` and `CLAUDE.md` where they describe current enforced product law;
5. this brief and `PRODUCT_TRUTH_ANNEX.md`;
6. screen inventory only where it agrees with current code;
7. older plans, archived docs and historic descriptions.

A plan is evidence of intention, not proof of implementation. If a challenger finds a conflict, it must inspect the frozen code instead of inventing an answer.

## 3. What Xplorer is

Xplorer is a **map-led local discovery and participation product**.

Its central proposition is to help an Explorer understand the local world around them, see what is happening, decide what is worth doing, participate in real life, and preserve or contribute what happened afterwards.

It combines:

- local places;
- businesses and properties;
- public places;
- events;
- recurring activity clubs;
- informal Link-ups;
- live Check-ins;
- Moments;
- Memories;
- reviews and reputation;
- social relationships;
- messaging and private boards;
- Manager tools;
- safety and moderation.

The desired loop is broader than place search:

**discover → understand → decide → join/visit/participate → experience → share/review/remember → build local knowledge and reputation**.

The long-term ambition is to make a town feel **alive rather than indexed**.

## 4. Geographic context

Xplorer is designed to grow town by town. Current development content includes East Sussex locations such as Brighton and Hastings.

Design for both density extremes:

- a busy town centre with many overlapping signals;
- a quiet area with sparse activity.

A design that only looks good on a densely populated showcase map is incomplete.

## 5. Human identity model

### Explorer

Every person is an **Explorer**. Visible UI should not fork people into separate account identities.

### Manager

Manager is a capability attached to an Explorer, not another person or another account.

Manager capabilities are granular across:

- businesses;
- properties;
- activity clubs;
- events.

A person can be a Manager in one context and an ordinary Explorer in another.

### Administrator

Admin is separate privileged product-operation access. Admin capabilities must not leak into ordinary Explorer or Manager access.

## 6. Canonical vocabulary and distinctions

These are product laws, not styling preferences.

- **Explorer** — every person.
- **Manager** — an Explorer with management capability.
- **Friend** — two Explorers who follow each other. There is no friend-request state.
- **Close friend** — an actual friend added by one Explorer to a narrower private list.
- **Place** — a fixed geographic thing. Businesses, properties and public places are important place families.
- **Club** — a recurring organised community. A Club has sessions.
- **Session** — a Club occurrence. It is not an Event.
- **Event** — a dated thing with a start time.
- **Link-up** — an informal local plan organised by an Explorer.
- **Claim** — the process of asserting management of an existing listing.
- **Verified** — a separate verification concept; never a synonym for Claim.
- **Check-in** — temporary opt-in presence at a public place.
- **Moment** — live, expiring content: what is happening **now**.
- **Memory** — persistent scrapbook content: what happened **here**.
- **Review** — an opinion/contribution about an eligible entity. It is neither a Moment nor a Memory.
- **Endorsement** — a useful-response signal attached to review contribution/reputation.

Do not invent a new noun where the product already has one.

## 7. Moments and Memories

**Moment ≠ Memory.**

They are separate records, separate concepts and separate lifecycles.

### Moment

A Moment is live content. It expires. It can appear in live/social surfaces and map activity according to permission. Live Moments are represented through the Explorer profile’s story/ring behaviour rather than a permanent Moment gallery.

### Memory

A Memory is persistent scrapbook content. It can remain on the profile, personal history/My Map and appropriate feed surfaces according to visibility.

A Memory has an independent current-map window. A Memory leaving today’s map does **not** mean the Memory was deleted.

A Moment may be deliberately kept as a Memory. That produces a separate Memory; it does not turn the Moment into a permanent Moment.

## 8. Audience and privacy model

Canonical content-audience vocabulary, narrowest first:

`nobody → selected → close_friends → friends → followers → everyone`

The Explorer’s profile visibility acts as a ceiling. A post may narrow its audience but may not silently widen beyond that ceiling.

Unknown audience values fail closed.

Presence is more sensitive than ordinary content. Live location/presence is capped more tightly than generic posting.

## 9. Check-ins

A Check-in means temporary opt-in presence at a **public place**.

At the frozen commit:

- valid targets are parks/other public places;
- the Explorer selects a canonical public place;
- broad area is retained;
- coordinates may be added approximately and are rounded;
- activity and an optional short message may be attached;
- a duration is chosen;
- the Check-in automatically expires or can be ended;
- the Check-in screen does not offer a second “Public” audience control;
- visibility is constrained by the Explorer’s settings and presence rules.

Do not redesign Check-ins into permanent location history.

## 10. The Living Map

The map is a core product surface and uses MapLibre at the frozen commit.

It can represent and coordinate multiple product layers, including place data, live activity, time-sensitive content, Moments/Memories, heat, clustering and route/direction behaviour.

Important current concepts include:

- search/filter controls;
- spatial clustering;
- live activity;
- heat based on contribution signals;
- Memory temporal behaviour;
- place panels;
- Directions;
- fallback/non-map accessibility surface;
- press/hold Link-up location behaviour.

The map is **not** merely a directory visualisation. It combines geography, time, activity, community and history.

The current map UI is not sacred. A challenger may rethink how Map, Discover and Live relate, provided real capabilities and privacy laws survive.

## 11. Discover and Live

Discover is the non-map recommendation/discovery layer. It can surface relevant local content such as happening-now items, Events, Clubs, Link-ups, saved items and local/social entry points. Recommendations are intended to have understandable reasons rather than unexplained ranking.

Live Nearby answers a different temporal question: **what can I actually do or see around here within a chosen area/time window?** It combines time-sensitive local activity and must remain useful in empty as well as populated states.

The separation between Map, Discover and Live is redesignable. Their underlying product responsibilities are not removable.

## 12. Current primary navigation — observation, not prescription

At the frozen commit the primary tab model is:

1. **News Feed** → `/feed`
2. **Messages** → `/messages`
3. **Map** → `/map` (raised centre action)
4. **Leaderboard** → `/leaderboards`
5. **Profile** → `/profile`

When already on the Map, the raised centre action becomes **Camera**. An upward centre interaction on the Map opens **Discover**.

This is a current implementation fact, not a tournament requirement. Challengers may propose a better architecture as long as the full product remains findable, understandable and coherent.

## 13. Camera and creation law

The in-app camera is a real capture surface: photo, short video and QR recognition are handled from the camera experience.

At the frozen commit, **Moments and Memories must begin at the camera**. Display surfaces may shortcut to the camera, but they may not bypass capture and become standalone upload creation routes.

The former generic `/create` launcher is intentionally absent.

After capture, the relevant creation flow handles caption/context/audience and the rest of the record.

Other creation capabilities still exist where product truth allows them, including Link-ups and Manager-capability-gated listing/community creation.

## 14. Place and activity families

### Businesses

May include information, location, images, reviews, reputation, directions, claims, Manager actions and verified-review mechanisms.

### Properties

May include stay information, location, host/management context, reviews, booking destination, claim behaviour and Manager QR tooling.

### Public places

Parks, beaches, viewpoints and similar public locations. They are important to live local participation and are not interchangeable with commercial listings.

### Activity Clubs

Recurring communities. Product truth includes join/application state, capacity, sessions, announcements, membership, private member boards, reviews and Manager controls.

### Events

Time-bound occurrences with fields such as category, location, start/end, price/capacity, publishing state and Manager controls. Review eligibility depends on event timing.

### Link-ups

Explorer-organised informal plans with organiser, time, location, attendance/capacity, visibility, join/leave behaviour, attendee list, private attendee meeting information, private board, organiser controls and safety/reporting.

Private attendee information must never be exposed to non-attendees.

## 15. Reviews and Explorer reputation

Reviews are both local knowledge and contribution to Explorer reputation.

Relevant behaviour includes combinations of:

- rating;
- title/body;
- images/video;
- QR verification;
- comments;
- endorsements;
- contribution points/reputation;
- moderation;
- Manager response/challenge where supported.

Do not reduce Reviews to a decorative star row. They participate in trust and Explorer contribution.

## 16. Explorer profile

An Explorer profile may represent:

- identity and optional area;
- follows/friend state;
- live Moment ring;
- Memories/scrapbook;
- Reviews and review reputation;
- Leaderboard position;
- favourites/collections;
- Club membership;
- owner-only My Map/history;
- safety actions on other Explorers.

The current layout is redesignable. The distinction between live Moments and persistent Memories is not.

## 17. Social relationships

Following is one-way.

Friendship emerges when both Explorers follow each other.

There is no friend request ceremony.

Close Friends are a narrower owner-controlled list and must not become a publicly readable ranking of relationships.

Blocking and reporting are consequential safety functions and must remain understandable and accessible.

## 18. Feed

The Feed represents the Explorer’s local/social world. It can carry supported social/local contributions and connect them back to the relevant Explorer, content and place.

It must respect audience rules and should remain recognisably part of a place-centred exploration product rather than becoming a generic social-network clone.

## 19. Messages

Xplorer has one communication hub with current views:

`All · Friends · Managers · Message Boards`

These views do not create separate identities or four separate messaging products.

- **Friends** filters direct friend conversations.
- **Managers** filters listing-context conversations; it is about the conversation context, not a Manager account identity.
- **Message Boards** surfaces existing authorised Link-up and Activity Club boards without weakening their own membership rules.

A challenger may redesign the information architecture but must preserve these relationship and access distinctions.

## 20. Notifications

Notifications span several domains, including live/social/community/account activity. Deep-linking, unread state and historical state matter.

Do not rely on colour alone to communicate unread or action-needed state.

## 21. Leaderboards and contribution

Leaderboards support time period and local/national scope. The purpose is to recognise useful local contribution, not expose hidden movement history or turn private activity into public spectacle.

## 22. Manager experience

Manager remains part of the Explorer identity.

Management domains include businesses, properties, Clubs and Events. Manager work can include listing management, membership work, review management and QR/verification tooling.

Creating one’s own listing and claiming an existing listing are different trust problems. Self-service creation is capability-gated; taking over an existing listing uses the Claim/admin boundary.

## 23. Admin experience

Admin is operational infrastructure. Current admin route families cover claims, activity/data operations, audit, Explorers, listings, moderation and public-place management.

Admin may be visually quieter than consumer discovery but must remain structurally coherent and usable.

## 24. Authentication, account and legal

The product includes login, signup, password recovery/update, settings, blocked Explorers, privacy/visibility controls, notification preferences, account deletion and legal/privacy/terms surfaces.

Signup creates an Explorer identity. It does not present an Explorer-vs-Manager account-type fork.

## 25. Safety and location principles

Location and social safety are product architecture, not decoration.

A design must preserve these principles:

- location/presence is opt-in;
- default visibility is conservative;
- precision is controlled;
- presence expires;
- private meeting details remain private;
- blocked-user restrictions survive every surface;
- server/database security remains authoritative;
- no interface should enable reconstruction of another Explorer’s movement history;
- consequential safety controls cannot depend on a hidden gesture alone.

## 26. Technical reality

At the frozen commit Xplorer is built with React Native, Expo, Expo Router, React Native Web, MapLibre and Supabase/Postgres/Auth/Storage/Edge Functions. The application is JavaScript, not a hypothetical native-only prototype.

Designs must respect real mobile realities: Android touch, safe areas, back behaviour, keyboard, permissions, camera, map rendering, varying performance, reduced motion and accessibility. Web should remain viable.

## 27. What challengers may change

Challengers may rethink:

- information architecture;
- navigation;
- screen grouping;
- Map/Discover/Live relationship;
- Explorer/Manager organisation;
- profile architecture;
- creation architecture within product laws;
- hierarchy and density;
- layouts;
- components;
- interaction and direct manipulation;
- gestures and transitions;
- typography, colour, spacing, depth and iconography;
- map overlays and filters;
- data visualisation;
- motion/feedback;
- empty/error/loading presentation;
- overall product character.

The objective is to evaluate the architecture, not preserve today’s screen arrangement.

## 28. What challengers may not silently change

A candidate may not:

- invent a capability or unavailable data;
- remove a material capability because it is inconvenient to design;
- make Manager a separate person/account identity;
- change friendship away from mutual follows;
- add a Friend Request system;
- conflate Moment and Memory;
- make Check-ins permanent;
- widen privacy to simplify UI;
- expose private Link-up meeting information;
- bypass Claim ownership rules;
- expose Admin capability to ordinary Explorers;
- create fake booking/payment/transport/delivery functionality;
- treat future product ideas as current functionality;
- hide critical safety actions behind gesture-only discovery;
- weaken database-backed permission assumptions.

## 29. Required system states

The whole-app design must account for appropriate variants of:

- loading;
- slow network;
- empty;
- no results;
- error and retry;
- signed out;
- unauthorised/private;
- location unavailable;
- permission denied;
- pending/approved/rejected/removed;
- capacity full;
- expired/cancelled;
- read/unread;
- dense map/content;
- missing media;
- long names/text;
- keyboard open;
- reduced motion;
- screen-reader/non-map access;
- destructive confirmation;
- server operation pending.

A beautiful happy path with broken state behaviour is not a completed candidate.

## 30. Common benchmark journeys

Every challenger must support the same functional journeys so designs are comparable.

1. **First discovery** — signed-out person understands the product and explores public local information without being shown private/live information they cannot access.
2. **Map to action** — Explorer finds something nearby, understands it and gets Directions or another valid next action.
3. **What is happening soon?** — Explorer evaluates live/local options across appropriate product entities.
4. **Join a Link-up** — discover → understand → join → attendee-only details/board → leave if needed.
5. **Join a Club** — discover → apply → pending → approved → sessions/announcements/private board.
6. **Create a Moment** — camera → live/temporary understanding → context/audience → publish → feedback.
7. **Keep a Memory** — camera/preserve → persistent scrapbook understanding → visibility/map-window understanding → find later.
8. **Check in** — public place → approximate location/activity/duration → understand audience → expire/end.
9. **Review and reputation** — create review with supported media/verification → interaction → contribution/reputation.
10. **Messages** — distinguish friend, listing/Manager and authorised board conversation contexts.
11. **Manage** — Explorer uses legitimate Manager capability without becoming a second identity.
12. **Claim** — attempt to manage an existing listing respects Claim/admin boundary.
13. **Privacy/safety** — change visibility, block or report with clear consequence.
14. **Failure** — map/network/permission/data failure still leaves a comprehensible route forward.

## 31. Independence rule

Each challenger starts from the same frozen source and the same shared truth package. No challenger may inherit another challenger’s candidate, reasoning or code.

Differences must emerge from the challenger’s own Persona Pack and professional reasoning.

## 32. Persona separation

This brief defines **the product**.

The challenger’s `PERSONA_PACK.md` defines **how that challenger reasons about the product**.

DesignLab’s Perfect-10 gate is a system quality requirement; it must never be falsely attributed to the referenced designer.

## 33. Anti-imitation

Use the persona’s documented reasoning, not the trade dress of products they worked on. Do not copy famous screens, signature layouts, proprietary illustration, branded motion or recognisable product chrome merely to signal the reference.

The candidate should remain defensible if the designer’s name is removed.

## 34. Required challenger process

Each candidate must:

1. pin the frozen Xplorer SHA;
2. read this brief;
3. read `PRODUCT_TRUTH_ANNEX.md` and `PRODUCT_TRUTH.json`;
4. read its own Persona Pack;
5. inspect the actual frozen Xplorer code in areas material to its design reasoning;
6. build an internal product/journey/state model;
7. diagnose structural problems before styling;
8. form a clear design thesis;
9. redesign the **whole product system**;
10. test the benchmark journeys and important states;
11. run persona-specific self-review;
12. re-check Product Truth for invented or lost functionality;
13. run the global DesignLab Perfect-10 gate;
14. revise until the candidate legitimately passes.

## 35. Deliverable

Return one coherent, opinionated version of Xplorer — not a moodboard, not four directions and not a hero screen followed by generic secondary UI.

The standalone mobile-friendly full-app HTML candidate must represent enough of the declared route/capability system that the user can judge:

> Would I want Xplorer to become this complete product?

It must include a design thesis, product architecture, navigation, hierarchy, core interactions, major consumer/social/Manager/Admin surfaces, state system, visual/motion logic, implementation realism, Product Truth verification and persona self-review.

## 36. Global entry gate

A challenger does not enter the tournament until it legitimately earns 5/5 in all ten DesignLab categories:

1. Product Truth Fidelity
2. User-Goal Clarity
3. Whole-App Coherence
4. Information Architecture & Navigation
5. Interaction & State Robustness
6. Accessibility & Inclusion
7. Trust, Safety & Privacy
8. Technical & Performance Realism
9. Persona Research Fidelity
10. Originality, Craft & Product Potential

No averaging. Any category below 5 blocks the candidate and requires revision followed by complete rescoring.

## 37. Central creative instruction

Do not ask:

> How do I redesign these existing screens?

Ask:

> Knowing everything Xplorer actually does, what is the most coherent product architecture and experience this could have?

Routes tell you where functionality is implemented today. They do not automatically define the best human mental model.

Compress complexity where you can. Expose relationships that are currently hidden. Remove navigational ceremony where it is unnecessary. Make dynamic state understandable. Strengthen the transition from phone to real world.

But preserve every material capability, relationship, consequence, permission and safety boundary.

## 38. Fair-tournament outcome

All seven challengers receive the same:

- frozen source commit;
- Master Product Brief;
- Product Truth Annex;
- machine-readable Product Truth;
- benchmark journeys;
- whole-app prototype standard;
- anti-imitation rules;
- universal quality gate.

Only the professional reasoning lens changes.

The desired result is seven independent answers to:

> **What should Xplorer become?**
