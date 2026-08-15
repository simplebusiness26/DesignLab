# Full-App HTML Tournament Standard

This is the mandatory review surface for DesignLab 2.0.

## Core rule
A tournament contestant does **not** redesign one isolated feature inside a shared shell.

Each contestant redesigns the **whole inspected product experience** as one coherent system, while preserving Product Truth.

For Xplorer, that means every UX or visual contestant must produce a complete, navigable Xplorer HTML candidate covering the real app structure and declared routes. The user should be judging "this version of Xplorer" versus "that version of Xplorer", not "this Messages screen" versus "that Messages screen".

## What must remain identical across contestants
- the inspected real features and capabilities;
- the route inventory and information architecture unless the tournament is explicitly allowed to propose a navigation reorganisation;
- the universal Explorer identity model;
- Manager as a capability/context, not a separate identity;
- privacy, permission and ownership rules;
- real entity relationships: businesses, properties, places, events, activity clubs, link-ups, Moments, Memories, reviews, messages, boards, profiles, manager tools and admin tools;
- backend boundaries and Product Truth constraints;
- the same representative sample scenarios so candidates can be compared fairly.

## What each contestant may redesign across the whole app
- global navigation and hierarchy;
- app shell and chrome;
- page composition;
- information density;
- card/list/grid systems;
- interactions, gestures and transitions;
- component treatments;
- state presentation;
- typography, spacing, colour, depth and motion when the tournament stage permits it;
- how repeated patterns behave across every relevant screen.

A contestant must carry its design language through the complete product rather than making only the hero screen distinctive.

## Whole-app coverage requirement
Each candidate must include, at minimum:
- the real primary navigation roots;
- Map and Discover;
- Create flows;
- Explorer profiles and social surfaces;
- Messages and existing board gateways;
- Feed, Moments and Memories;
- Leaderboards and Notifications;
- Live activity and check-ins;
- Link-ups;
- businesses, properties and public places;
- activity clubs and events;
- reviews and verified-review entry points;
- Manager surfaces;
- Settings and safety;
- authentication surfaces;
- Admin surfaces;
- every other declared route represented sufficiently that the candidate is genuinely a whole-app system rather than a collection of selected showcase screens.

## Fidelity rule
The HTML does not require a live backend. Fake/sample data may simulate real states, but fake features may not be added.

Every route, capability, label, relationship and permission assumption must come from the inspected app or be explicitly marked as a proposal requiring approval.

## Tournament rule
All contestants receive the same Product Truth, route inventory, capability map, sample scenarios and acceptance gates.

They are evaluated on whether their design system holds together across the entire app.

A contestant fails if it looks distinctive on Map or Messages but collapses into generic UI elsewhere.

## UX tournament
UX contestants must make the whole app recognisably attributable to their design lens through behaviour, hierarchy, navigation, state handling and interaction patterns — not merely colour or styling.

## Visual tournament
Visual contestants receive the locked whole-app UX and apply their visual direction across the entire app. No visual candidate may be judged from only a hero screen.

## Packaging
Each contestant must be deliverable as a self-contained mobile-friendly HTML file or HTML folder.

A combined tournament review file may embed the complete contestants and provide A/B/C/D switching, but each embedded option must itself remain a complete navigable product.

## Acceptance test
Before calling a contestant ready, verify:
1. I can enter the candidate and immediately recognise a complete Xplorer product.
2. I can move between the main product areas without leaving the candidate.
3. The design language remains coherent across social, discovery, place, creation, manager and admin surfaces.
4. All critical real capabilities remain represented.
5. No invented feature or identity model has appeared.
6. The contestant is distinguishable from the others by how the whole product works, not just by colours.
7. I can make a product-level choice without having to imagine how the rest of the app would look.

If any answer is no, the contestant is incomplete.
