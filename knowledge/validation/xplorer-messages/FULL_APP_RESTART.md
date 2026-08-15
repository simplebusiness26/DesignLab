# Xplorer Messages — Full-App HTML Restart

Status: ACTIVE RESET
Date: 2026-08-15

## Decision
The previous Xplorer Messages UX rounds, Round 2 prototypes and three-way synthesis remain in repository history for reference, but they are **superseded** and are not the active design decision path.

No previous winner, blend or implementation decision carries forward automatically.

## Restart point
DesignLab restarts from the current real Xplorer Product Truth and surrounding app structure.

The target remains Xplorer Messages, but every candidate must be reviewed inside a full-app HTML representation of Xplorer rather than as an isolated Messages mock-up.

## Mandatory candidate format
Each UX candidate must:
- open as a recognisable Xplorer experience;
- include the real primary navigation and relevant surrounding product surfaces derived from the inspected app;
- allow the reviewer to navigate into Messages from the surrounding app and back out again;
- embed that contestant's Messages UX in the correct place;
- simulate only real states/capabilities and never invent product features, routes or identities;
- include enough interaction fidelity to judge scrolling, keyboard movement, message history, category changes, boards, permissions, transitions and continuity;
- be packaged as self-contained mobile-friendly HTML.

All contestants use the same Product Truth and full-app context contract.

## Tournament gates
1. Re-inspect current Xplorer and rebuild Product Truth where needed.
2. Establish the shared full-app Xplorer HTML shell from that Product Truth.
3. Run the four UX persona candidates inside that shell.
4. User selects, mixes, rejects, or rejects all.
5. Synthesize only after user feedback.
6. Explicitly lock the new UX.
7. Only then run the visual tournament, also inside full-app HTML context.
8. Implement into the real app only after visual lock.

## Previous production implementation
The previous real-app Messages implementation created from the superseded synthesis is not the authoritative final design. It must remain unmerged/paused unless the restarted process independently leads back to it or the user explicitly chooses to restore it.

## Acceptance principle
The user should never have to imagine how a candidate fits into Xplorer. The candidate itself must show that context.
