# Prototype Standard

DesignLab prototypes are **full-app HTML review experiences**, not detached screen mock-ups and not production apps.

The full-app requirement exists so the user judges a candidate in the same product context it will eventually live in.

## Mandatory review surface
Every UX or visual tournament candidate must follow `FULL_APP_HTML_STANDARD.md`.

For Xplorer, opening a candidate should feel like opening Xplorer. The target feature is redesigned inside the surrounding app shell rather than shown by itself.

## Must demonstrate
- recognisable product shell and primary navigation derived from Product Truth;
- navigation into and back out of the redesigned area;
- core taps;
- important gestures plus visible alternatives;
- scroll behavior;
- sheets/menus;
- keyboard movement;
- loading, empty, error and populated states;
- representative long content;
- transitions relevant to comprehension;
- accessibility assumptions;
- surrounding screens/routes needed to judge whether the candidate belongs in the app;
- no invented capabilities, identities, routes or backend behaviour.

## Does not require
- real production backend;
- production security architecture inside the HTML simulation;
- full production data;
- final production deployment;
- production analytics.

## Important distinction
The HTML must represent the **full app context**, but it does not need to reproduce every production implementation detail. Simulated data may stand in for real data. Missing production backend behaviour must be clearly simulated rather than invented.

The prototype exists to let the user judge how the concept works **inside the real product structure** before paying to build it for real.
