# Xplorer Tournament B — Product Truth Annex

Status: LOCKED SHARED INPUT
Purpose: machine-grounded factual reference for every Challenger Tournament B candidate
Source repository: `simplebusiness26/The-App`
Frozen source commit: `78632b12eeb4e4123b1a767c8b815fe6617681f9`
Frozen tree: `d6aa748c66cf90ee5637e793d71feaa6b4cf399a`
Companion brief: `MASTER_PRODUCT_BRIEF.md`
Structured copy: `PRODUCT_TRUTH.json`

---

## 0. Verification contract

This annex exists to stop persona creativity from changing Product Truth.

A challenger may radically redesign Xplorer, but it must not invent, remove or silently reinterpret the facts below.

### Evidence classes

- **CODE** — read directly from source at the frozen SHA.
- **SCHEMA/GATE** — read from migrations or deterministic verification scripts at the frozen SHA.
- **REPO LAW** — explicit current invariant in `RULES.md`/`CLAUDE.md`, cross-checked against current code where material.
- **RECORDED RUN** — result recorded in the frozen commit message; useful evidence, but not independently rerun by DesignLab while creating this annex.

### What was independently confirmed for this annex

- the exact frozen commit and Git tree;
- all 76 declared Expo Router `Stack.Screen` routes from `app/_layout.js`;
- current primary-tab/navigation data from `utils/navigation.js`;
- the single permission decision layer from `utils/permissions.js`;
- canonical audience vocabulary enforcement from `scripts/verify-audience-vocabulary.cjs`;
- friendship/presence privacy invariants from `scripts/verify-friends-visibility.cjs`;
- camera-only Moment/Memory entry from `scripts/verify-camera-only-creation.cjs`;
- messaging-view semantics from `utils/messageViews.js` and `app/messages/index.js`;
- Moment/Memory/map-time and heat semantics from `utils/mapLayers.js`;
- public-place-only Check-in behaviour from `app/checkins/create.js`;
- Explorer-only identity/no Manager account fork from `utils/permissions.js` and signup code;
- current Manager capability families from `utils/permissions.js` and `app/manager/dashboard.js`;
- available verification commands from `package.json`.

### Recorded upstream validation at the frozen commit

The frozen commit message records:

- **926 tests / 67 suites: passing**;
- **screen gates: passing**.

That recorded result is not the same as DesignLab independently rerunning the suite in the annex-generation session. Candidates still have to run the applicable gates in their own isolated worktree.

---

# 1. Important stale-document corrections

These corrections are mandatory because older Xplorer descriptions conflict with the frozen code.

## 1.1 Current primary navigation is not the older Map / Discover / Create / Leaderboard / Profile set

At the frozen SHA, `utils/navigation.js` defines:

1. **News Feed** → `/feed`
2. **Messages** → `/messages`
3. **Map** → `/map` — raised centre slot
4. **Leaderboard** → `/leaderboards`
5. **Profile** → `/profile`

When already on `/map`, the raised centre action becomes **Camera** → `/camera`.

An upward drag/swipe from the centre control on `/map` opens **Discover** → `/discover`.

This is current implementation truth, not a requirement that challengers preserve the same navigation architecture.

## 1.2 There is no generic `/create` route

`app/create.js` is intentionally absent. The camera-only verification gate explicitly guards against bringing the orphan creation launcher back.

Moment and Memory display surfaces must route through `/camera`, not directly to an empty Moment/Memory creation form.

## 1.3 Account type is not a permission model

The current client is deliberately prevented from reading `profiles.account_type` as a permission decision.

Every account is an Explorer. Manager is capability, not identity.

`utils/permissions.js` is the one client-side decision layer for:

- signed in;
- administrator;
- manages something;
- specific Manager capability.

Database/RLS remains the real security boundary.

## 1.4 Check-ins are public-place-only

At the frozen SHA, the Check-in UI only offers:

- Park
- Other public place

The publish path requires a canonical `public_place_id`.

Businesses, Clubs and Events are not valid current Check-in targets.

## 1.5 Presence does not have a local “Public” audience choice

Check-ins inherit the Explorer’s privacy ceiling and are additionally capped by the presence rules. The Check-in screen explains the effective audience and links to Settings rather than offering another audience selector.

## 1.6 Live Moments are not a permanent profile gallery

The permanent Moment grid was removed. A live Moment can contribute to a profile story/ring count while it is live. Persistent scrapbook content belongs to Memories.

---

# 2. Exact declared route manifest

Machine source: `app/_layout.js` at the frozen SHA.
Declared route count: **76**.

`_layout.js` itself is not a route. Native/web platform variants for `/map` represent one declared route.

## 2.1 Core / navigation / account-facing roots — 24

1. `/`
2. `/settings`
3. `/legal/privacy`
4. `/legal/terms`
5. `/map`
6. `/messages`
7. `/messages/[id]`
8. `/discover`
9. `/scan`
10. `/camera`
11. `/qr/[code]`
12. `/profile`
13. `/profile/[id]`
14. `/profile/edit`
15. `/explorers`
16. `/connections/[id]`
17. `/feed`
18. `/moments/create`
19. `/moments/[id]`
20. `/memories/create`
21. `/memories/[id]`
22. `/social-comments/[id]`
23. `/leaderboards`
24. `/notifications`

## 2.2 Live / Link-up / safety — 8

25. `/linkups`
26. `/linkups/create`
27. `/linkups/[id]`
28. `/linkups/edit/[id]`
29. `/linkups/board/[id]`
30. `/live`
31. `/checkins/create`
32. `/safety/blocked`

## 2.3 Authentication — 4

33. `/auth/signup`
34. `/auth/login`
35. `/auth/forgot-password`
36. `/auth/update-password`

## 2.4 Manager — 4

37. `/manager/dashboard`
38. `/manager/requests`
39. `/manager/qr/[type]/[id]`
40. `/manager/membership-status/[id]`

## 2.5 Businesses — 6

41. `/business/[id]`
42. `/business/dashboard`
43. `/business/add`
44. `/business/edit/[id]`
45. `/business/review/[id]`
46. `/business/review-action`

## 2.6 Properties — 7

47. `/property/[id]`
48. `/property/dashboard`
49. `/property/add`
50. `/property/edit/[id]`
51. `/property/reviews`
52. `/property/review/[id]`
53. `/property/review-action`

## 2.7 Public places — 3

54. `/places`
55. `/places/[id]`
56. `/places/review/[id]`

## 2.8 Activity Clubs — 6

57. `/activity-clubs`
58. `/activity-clubs/[id]`
59. `/activity-clubs/add`
60. `/activity-clubs/edit/[id]`
61. `/activity-clubs/message-board/[id]`
62. `/activity-clubs/review/[id]`

## 2.9 Events — 5

63. `/events`
64. `/events/[id]`
65. `/events/add`
66. `/events/edit/[id]`
67. `/events/review/[id]`

## 2.10 Admin — 9

68. `/admin/claims`
69. `/admin/activities`
70. `/admin/areas`
71. `/admin/audit`
72. `/admin/dashboard`
73. `/admin/explorers`
74. `/admin/listings`
75. `/admin/moderation`
76. `/admin/public-places`

### Route design rule

The candidate does not have to preserve one screen per route or the current navigation grouping. It **does** have to preserve every material capability and state represented by these routes unless Product Truth proves the route is only technical plumbing.

---

# 3. Current navigation facts

Machine source: `utils/navigation.js`.

## 3.1 Tabs

| Key | Label | Route | Account required for destination? | Current special behaviour |
|---|---|---|---:|---|
| feed | News Feed | `/feed` | yes | ordinary tab |
| messages | Messages | `/messages` | yes | ordinary tab |
| map | Map | `/map` | no | raised centre slot |
| score | Leaderboard | `/leaderboards` | yes | ordinary tab |
| profile | Profile | `/profile` | yes | ordinary tab |

Signed-out visitors still see the five-tab structure; destinations requiring an account route through login rather than being silently hidden.

## 3.2 Map centre action

On `/map`, the centre control becomes:

- **Camera** → `/camera`

## 3.3 Map upward interaction

On `/map`, upward drag beyond the defined threshold opens:

- **Discover** → `/discover`

This interaction is a current design choice, not protected tournament architecture.

## 3.4 Root-screen logic

Back is not treated as meaningful on `/` or the five tab roots. Child pages use back/navigation semantics.

## 3.5 Full-screen route rule

`FULL_SCREEN_ROUTES` is empty at the frozen SHA.

---

# 4. Identity and capability matrix

Machine sources: `utils/permissions.js`, `app/auth/signup.js`, Manager code and database-backed gate scripts.

| Human/capability | Meaning | Current decision source | Security note |
|---|---|---|---|
| Signed out | No authenticated Explorer | Supabase Auth | public surfaces only |
| Explorer | Every authenticated person | identity model | universal identity |
| Friend | two Explorers mutually follow | DB predicate | no request state |
| Close friend | owner-selected actual friend | DB/RLS | list itself private to owner |
| Manager capability | Explorer has tools for a capability family | `has_manager_capability()` | DB-backed; not account type |
| Manages something | Explorer already manages at least one listing/entity | `manages_any_listing()` | not equivalent to capability unlock |
| Administrator | privileged operations access | `guestbook_is_admin()` | DB-backed |

## 4.1 Manager capability families

Exact client allow-list:

- `businesses`
- `properties`
- `activity_clubs`
- `events`

## 4.2 Permission decision rule

Client UI permission questions go through `utils/permissions.js`.

Direct screen-level calls to `guestbook_is_admin`, `manages_any_listing` or `has_manager_capability` are guarded against by `verify-one-permission-point.cjs`.

## 4.3 Security boundary

The client decides what is sensible to show and what explanation to give. Row Level Security / trusted database functions remain authoritative for what data/actions are actually allowed.

---

# 5. Canonical entity graph

This graph is the product-level entity model candidates must preserve. It is intentionally about **meaningful product entities**, not every helper/view/table in Postgres.

## 5.1 Explorer/social graph

`Explorer profile`

→ follows → `Explorer profile`

Mutual follows → derived **Friend** relationship

Explorer → owner-selects → `Close friend` membership

Explorer → may have → favourites / notifications / blocks / safety reports / contribution ledger

Explorer → may hold granular → Manager capabilities

## 5.2 Managed/local entity graph

Explorer with capability

→ creates/manages → `Business`

→ creates/manages → `Property`

→ creates/manages → `Activity Club`

→ creates/manages → `Event`

Existing listing without current ownership

→ may receive → `Claim`

Claim

→ requires administrative decision to transfer/confirm existing listing management

## 5.3 Public place graph

`Public place`

→ can be geographic context for live participation

→ is the valid Check-in location family at the frozen SHA

→ can have supported social/review/place interactions according to current code

## 5.4 Club graph

`Activity Club`

→ has → `Sessions`

→ has → `Announcements`

→ receives → `Membership applications`

Membership lifecycle can include states such as pending, approved, rejected, removed/ended/left where represented by current flows.

Approved membership

→ grants access to → Club private Message Board

## 5.5 Event graph

`Event`

→ has dated start/end and publishing lifecycle

→ can have capacity/price/location/booking context

→ review availability is time-sensitive

## 5.6 Link-up graph

Explorer

→ organises → `Link-up`

Link-up

→ has → attendee membership

Joined attendee

→ may access → private meeting details

Joined attendee

→ may access → Link-up Message Board

Non-attendee

→ must not receive attendee-only meeting details

## 5.7 Presence graph

Explorer

→ starts → `Check-in`

Check-in

→ must attach to → canonical public place

Check-in

→ has → activity / optional message / approximate position / expiry

Check-in

→ ends manually or expires automatically

## 5.8 Social-content graph

Explorer

→ posts → `Moment`

Moment

→ expires

Moment

→ may be deliberately preserved as → **new separate Memory**

Explorer

→ owns → `Memory`

Memory

→ persists independently of its current-map window

Memory

→ may appear on profile/My Map/feed according to visibility and scope

## 5.9 Review graph

Explorer

→ authors → `Review`

Review

→ attaches to eligible place/activity entity

Review

→ may have → images/video

Review

→ may carry → QR verification

Review

→ may receive → comments / endorsements

Review contribution

→ may affect → Explorer contribution/reputation/Leaderboard ledger

Manager

→ may respond/challenge where current entity flow supports it

## 5.10 Messaging graph

One inbox has direct conversations of two semantic kinds:

- `friend`
- `listing`

Message Boards are authorised group systems surfaced from:

- Link-ups
- Activity Clubs

They are not converted into ordinary direct conversations merely to simplify UI.

---

# 6. State/lifecycle truth

Candidates must preserve the *meaning* of these lifecycles even if state presentation changes.

## 6.1 Audience order

Canonical generic content audience vocabulary:

1. `nobody`
2. `selected`
3. `close_friends`
4. `friends`
5. `followers`
6. `everyone`

Legacy audience synonyms such as `private`/`public` are forbidden as canonical stored audience values by the verification gate.

## 6.2 Profile visibility / presence ceiling

Presence uses a stricter effective ceiling. The privacy gate verifies that sensitive presence cannot widen to one-way followers simply because generic content can use `followers`.

## 6.3 Moment lifecycle

`published/live` → expires

Optional preserve action → creates separate Memory

No permanent live-Moment gallery is part of current truth.

## 6.4 Memory lifecycle

Created → persistent Memory

`visibility` determines who may see it, subject to profile ceiling/security.

`map_until` independently determines whether it remains on the current map.

Current-map removal ≠ deletion.

Historical/My Map/profile behaviour can survive after current-map expiry.

## 6.5 Memory pin map fade

`utils/mapLayers.js` defines:

- fade across the final quarter of the Memory’s own map window;
- minimum pre-removal pin opacity `0.35`;
- opacity becomes `0` at/after `map_until`.

The exact visual treatment may be redesigned, but a candidate must not reinterpret map-window expiry as Memory deletion.

## 6.6 Heat privacy floor

Current pure map rules use approximately two-decimal geographic precision and require:

- at least **3 contributions**;
- from at least **2 different Explorers**

before a heat cell is emitted.

The purpose is to prevent “busy area” from becoming a precise disclosure of one person.

## 6.7 Check-in lifecycle

Created at public place → live for chosen limited duration → manual end or automatic expiry.

## 6.8 Friendship

One-way follow → following relationship only.

Mutual follows → Friend.

Unfollow breaks Friend status on subsequent evaluation.

## 6.9 Manager capability

Capability can be inactive/requested/pending/active or trial-like states according to current Manager flow. A candidate must distinguish “has tools unlocked” from “already manages an entity”.

## 6.10 Club membership

Important states represented by current flows include:

- can apply;
- pending;
- approved;
- rejected;
- removed/ended/left;
- full/capacity blocking.

## 6.11 Notifications

Notifications have unread/read behaviour and can represent action-needed vs historical state.

---

# 7. Permission and exposure matrix

This is a human-readable minimum. Database policies remain authoritative.

| Capability/data | Signed out | Explorer | Friend/approved member/attendee context | Manager context | Admin |
|---|---:|---:|---:|---:|---:|
| public place/business/property/Club/Event discovery | yes where published/public | yes | yes | yes | yes |
| private/live social data | no | only if audience allows | may widen only within defined audience | same Explorer rules | operational access only where policy permits |
| Check-in creation | no | yes, public places only | n/a | same human identity | admin does not create a parallel identity |
| Check-in visibility | no private presence | ceiling-controlled and presence-capped | friends may qualify | same Explorer rules | policy-defined |
| direct Friend messages | no | requires valid relationship/context | mutual-friend path | same identity | not a second inbox |
| listing-context messages | no | may message/manage in valid listing context | n/a | listing side identified per conversation | policy-defined |
| Club board | no | no unless authorised | approved membership/Manager as policy allows | yes where authorised | operational policy |
| Link-up private board/details | no | no before membership | joined attendee/organiser | Manager concept irrelevant | safety/admin only if policy permits |
| create own managed entity | no | only with relevant Manager capability | n/a | yes for unlocked family | admin not required for ordinary own creation |
| take over existing listing | no | Claim path | n/a | Claim path if not owner | admin decision boundary |
| Admin routes | no | no | no | no by Manager capability alone | yes |
| owner-only My Map/history | no | own only | no | own Explorer identity only | not automatically public |

### Permission design rule

A visual candidate may reorganise where these actions appear. It may not make an action look allowed when the Product Truth says it is forbidden, or imply that a hidden button is the security mechanism.

---

# 8. Current messaging truth

Machine sources: `utils/messageViews.js`, `app/messages/index.js`.

Current message views:

- All
- Friends
- Managers
- Message Boards

## Direct-conversation kinds

- `friend`
- `listing`

A listing conversation belongs in the Managers view regardless of which side of the conversation the current Explorer is on. `viewer_is_manager` explains the Explorer’s side in that thread; it does not classify the human as a separate account type.

## Board truth

Boards are returned through their own authorised system and routed to their existing board routes. Listing boards in the Messages hub must not grant access that the underlying Club/Link-up policy would deny.

---

# 9. Current camera/creation truth

Machine source: `scripts/verify-camera-only-creation.cjs` plus current routes.

- Moment creation screen reached without captured media redirects to `/camera`.
- Memory creation screen reached without captured media redirects to `/camera`.
- Display surfaces are forbidden from directly navigating to `/moments/create` or `/memories/create` except the camera handoff.
- `app/create.js` must remain absent under current Product Truth.
- Camera must preserve a place preset when the flow begins from a place.

A challenger may redesign the interaction, but a candidate that reintroduces generic upload-first Moment/Memory creation is not faithful to the frozen product.

---

# 10. Current map semantics that constrain design meaning

Machine source: `utils/mapLayers.js` plus Living Map code referenced by the source inventory.

## 10.1 Time windows

A map item can have a start/created time and an end/expiry/map-until time. Static places/reviews can be effectively persistent; time-bound things leave appropriate live/current views.

## 10.2 Heat

Current contribution weights:

- review: `3`
- memory: `2`
- moment: `1`

These are current implementation values, not an immutable visual-brand law. Their privacy purpose and the distinction between contribution types must not be casually erased if a redesign still represents “busy”/heat.

## 10.3 Link-up location from map

Dropping on a known place can preserve that place identity/position.

Dropping on open map uses rounded approximate coordinates and is explicitly not treated as an exact doorstep-level point.

---

# 11. Verified guard/gate map

Machine source: `package.json` plus specific gate scripts.

The frozen package exposes these verification commands:

| Command | Protects / checks |
|---|---|
| `npm test` / `npm run test:ci` | Jest suites |
| `verify:social` | social layer invariants |
| `verify:live` | Link-up/live invariants and hardening |
| `verify:screens` | screen/route gates |
| `verify:taxonomy` | entity/taxonomy consistency |
| `verify:markers` | map marker assignment |
| `verify:place` | shared place layout/behaviour |
| `verify:cards` | map/place-card contracts |
| `verify:discover` | Discover contracts |
| `verify:reputation` | review reputation |
| `verify:places` | place-follow behaviour |
| `verify:memories` | Memory invariants |
| `verify:mymap` | My Map/privacy behaviour |
| `verify:livingmap` | Living Map behaviour |
| `verify:browser` | browser/web behaviour |
| `verify:trending` | trending contracts |
| `verify:score` | Explorer Score/ledger behaviour |
| `verify:manager` | Manager identity/boundary |
| `verify:listings` | listing-creation gate |
| `verify:permissions` | one permission decision point / identity constraints |
| `verify:friends` | mutual-friend visibility / presence cap |
| `verify:contrast` | colour contrast constraints |
| `verify:nativemap` | native map prop/behaviour expectations |
| `verify:audience` | canonical audience vocabulary |
| `verify:camera` | camera-only Moment/Memory creation entry |
| `verify:audit` | audit invariants |

### High-risk gates challengers must not contradict

Particularly important for design work:

- `verify:permissions`
- `verify:friends`
- `verify:audience`
- `verify:camera`
- `verify:manager`
- `verify:listings`
- `verify:memories`
- `verify:mymap`
- `verify:livingmap`
- `verify:contrast`
- `verify:screens`

A prototype can simulate data, but it must not tell a product story that would require these invariants to be removed.

---

# 12. Required failure/edge-state coverage

The following state families exist because the product crosses network, account, privacy, map, moderation and real-world participation boundaries.

Every whole-app candidate must show a coherent answer where relevant for:

- signed out / login required;
- initial loading;
- refresh/loading more;
- slow or failed network;
- error with retry;
- no results;
- empty community/activity;
- map renderer unavailable / non-map alternative;
- location permission refused;
- location unavailable;
- private/not authorised;
- blocked relationship;
- pending membership/capability/claim;
- approved/rejected/removed membership;
- full/capacity reached;
- expired Moment/Check-in/map window;
- cancelled Event/Link-up where supported;
- unread/read notification/message;
- missing imagery;
- long content/name;
- keyboard open;
- reduced motion;
- destructive confirmation;
- server write in progress / refused;
- screen reader/non-map access.

---

# 13. Confirmed non-features / forbidden inventions

Unless a candidate explicitly marks something as a proposal requiring separate approval, Tournament B must not present these as existing Product Truth:

- a separate Manager account identity;
- a Friend Request workflow;
- permanent Check-ins/live movement history;
- automatic Moment=Memory conflation;
- a generic `/create` hub;
- direct upload-first Moment/Memory creation bypassing camera;
- Check-ins at businesses, Clubs or Events;
- public attendee-only Link-up meeting details;
- transport/taxi booking;
- food ordering/delivery;
- payment processing/checkout not proven by frozen code;
- future local-services marketplace capability;
- AI recommendation functionality beyond what current code proves;
- admin powers for ordinary Manager capability;
- “public/private” as replacement stored audience values;
- a new persistent social relationship table merely to represent Friend state.

---

# 14. Whole-product coverage matrix for candidate review

Every challenger must make the following capability families feel like one product:

| Family | Minimum truth to represent |
|---|---|
| Navigation | complete path between major product areas |
| Map | local geography, place/live/content layers, failure alternative |
| Discover | explainable local discovery/recommendation |
| Live | time-sensitive nearby activity |
| Feed | local/social contribution |
| Messages | friend/listing contexts + authorised boards |
| Explorer profile | identity, contribution, scrapbook/reputation, owner-only differences |
| Moments | live/temporary, camera-originating |
| Memories | persistent, visibility + independent map window |
| Check-ins | public-place-only, approximate, expiring presence |
| Link-ups | discover/join/attendee privacy/board/organiser safety |
| Activity Clubs | discover/apply/membership/sessions/board/Manager |
| Events | discover/time/capacity/Manager/review timing |
| Businesses | discover/detail/review/claim/Manager |
| Properties | discover/detail/review/claim/Manager |
| Public places | public local context and supported interactions |
| Reviews | rating/media/verification/social contribution/reputation |
| Leaderboard | contribution ranking without privacy leakage |
| Notifications | live/social/community/account attention state |
| Manager | capability unlock + management work without identity fork |
| Claims | protected takeover of existing listing |
| Settings/safety | visibility, blocking/reporting, legal/account consequence |
| Auth | signup/login/recovery without identity fork |
| Admin | operational/moderation/data/claim tooling |

---

# 15. Evidence ledger

These are the highest-load-bearing frozen files used to build this annex.

| Evidence | Frozen blob SHA | What it proves |
|---|---|---|
| `app/_layout.js` | `74c9ac7fcc098cb202123e0994d170fd91a63f50` | exact 76 declared routes, global shell |
| `utils/navigation.js` | `f0761222870bd2a8c8386ae5acbffb5fc08cfc75` | current five tabs, Map centre Camera action, Discover upward interaction |
| `utils/permissions.js` | `1db1648a2673e2284d0fbff4de928b3710f5e4e3` | universal Explorer identity, one permission decision point, capability families |
| `app/auth/signup.js` | `fdc7448fd5a50c9cf846a012c88ca313a9b105ea` | signup does not expose Manager-vs-Explorer fork |
| `RULES.md` | `3efc45fa68aff8342efc7b76d05ca06b8a202c11` | canonical vocabulary/privacy laws |
| `app/checkins/create.js` | `781763cc6174c28e346984914d11543ebcabaf2d` | public-place-only Check-in UI and privacy explanation |
| `utils/messageViews.js` | `8c45016ea507dec73aa0fec921f546d3a0d5a3a5` | All/Friends/Managers/Boards semantics |
| `app/messages/index.js` | `999b6aa62cd50152a9eff537986802dc905c1ea3` | one inbox plus board gateways |
| `components/ExplorerProfileScreen.js` | `e08a7d152ca67ee08641e2fda8bd109acf6652fa` | live Moment count/ring, persistent Memory profile behaviour |
| `app/manager/dashboard.js` | `2dbd5da2fa54336c004f12ca9cb56a7ead03d0db` | granular Manager capability/dashboard states |
| `utils/mapLayers.js` | `d3c6006401f9ee32b32274734c4fbd26441c7f87` | Memory map lifecycle, time model, heat/privacy math, Link-up map location semantics |
| `scripts/verify-one-permission-point.cjs` | `b3556ab836c3c40fbc89cc6616018a537f0e375e` | no client account-type fork; one permission layer |
| `scripts/verify-audience-vocabulary.cjs` | `81d2fabc20f773195628da880d4629ab99d6c126` | audience vocabulary guard |
| `scripts/verify-camera-only-creation.cjs` | `5dd961e24b746a58ef6db663def882c72ea57eb8` | Moment/Memory camera-only entry and no `/create` |
| `package.json` | `3e13084b114a01cedce966f03e46dd1a2cea296c` | stack/dependencies + verification command inventory |
| frozen Git tree | `d6aa748c66cf90ee5637e793d71feaa6b4cf399a` | immutable repository snapshot for tournament |

`verify-friends-visibility.cjs` was also inspected for the mutual-friend/presence cap and default-private invariants; its full source is part of the frozen tree even where connector output truncation prevents recording its blob SHA here.

---

# 16. Candidate truth-check checklist

Before a candidate is allowed into the Perfect-10 quality gate, answer **yes** to all of these:

1. Is the candidate explicitly based on frozen Xplorer SHA `78632b12…`?
2. Does it account for all 76 declared route capabilities, even if reorganised?
3. Is every human still an Explorer?
4. Is Manager still capability/context rather than a second identity?
5. Is friendship still mutual follow with no Friend Request state?
6. Are audience/privacy semantics preserved?
7. Are presence/Check-ins still stricter than generic post visibility?
8. Are Check-ins still public-place-only and expiring?
9. Are Moments still live/expiring?
10. Are Memories still persistent and separate from their current-map window?
11. Does Moment → Memory preservation create the conceptual equivalent of a separate Memory rather than an immortal Moment?
12. Do Moment/Memory creation journeys begin at the camera?
13. Has the candidate avoided reintroducing a generic create hub as if it currently exists?
14. Are attendee/member/private board details protected?
15. Are claims distinct from creating/managing one’s own entity?
16. Are Admin powers still separate?
17. Does Messages preserve friend vs listing context and board authorisation?
18. Does the map design avoid turning aggregate/local activity into precise one-person location disclosure?
19. Are important failure/empty/loading/privacy states represented?
20. Has the candidate invented zero unapproved product capabilities?

If any answer is **no**, Product Truth Fidelity is not 5/5 and the candidate is blocked.

---

# 17. Annex use rule

Every challenger receives the exact same three shared product files:

1. `MASTER_PRODUCT_BRIEF.md`
2. `PRODUCT_TRUTH_ANNEX.md`
3. `PRODUCT_TRUTH.json`

The challenger’s Persona Pack is then added on top.

The Product Truth package must not be rewritten per persona. If a future source change is intentionally accepted, regenerate the shared truth package from the new frozen SHA and restart fairness from that common baseline.
