# Full-App HTML Review Standard

This is the mandatory review surface for DesignLab 2.0.

## Core rule
A tournament candidate is not review-ready unless the user can open it as a self-contained HTML experience that represents the full product context around the area being redesigned.

For Xplorer, that means the candidate must feel like opening Xplorer, not opening a detached mock-up of one screen.

## Every candidate must include
- the real product shell and primary navigation structure derived from Product Truth;
- enough surrounding screens and routes to understand where the redesigned area lives;
- working navigation into and back out of the redesigned area;
- representative map/feed/profile/messages/manager or other relevant product surfaces when they form the surrounding experience;
- the candidate UX embedded in its correct place inside that shell;
- populated, empty, loading, error and permission/state variants relevant to the candidate;
- scrolling, keyboard behaviour, gestures, transitions and back-navigation needed to judge continuity;
- no invented product capability, route, identity model or backend;
- clear labels for any simulated data or non-production behaviour.

## Fidelity rule
The shell does not need a live backend, but its information architecture, routes, capabilities, labels and relationships must come from the inspected real app. Fake data may simulate real states; fake features may not be added.

## Tournament rule
All contestants receive the same full-app shell contract and Product Truth. They may redesign the target experience and its necessary surrounding transitions, but they may not quietly redesign unrelated product functionality merely to make their concept look better.

## Review rule
The user judges each candidate in context: how it enters from the rest of Xplorer, how it feels while using it, and how it returns to the surrounding app. A beautiful isolated screen that feels wrong inside Xplorer fails.

## Packaging
Each candidate must be deliverable as a self-contained HTML file or self-contained HTML folder that opens in a normal mobile browser. Combined tournament review files may embed each full-app candidate, but must not replace the candidate's own full-app context.

## Acceptance test
Before calling a candidate ready, verify:
1. I can recognise this as the product before entering the redesigned feature.
2. I can navigate into the feature from the surrounding app.
3. I can use the core interaction flow.
4. I can navigate back out without breaking context.
5. I did not need an explanation to imagine how the design would fit into the app.

If any answer is no, the candidate is incomplete.
