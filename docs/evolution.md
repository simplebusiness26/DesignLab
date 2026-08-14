# Evolution and lineage

DesignLab is evolutionary rather than merely iterative: generation N+1 starts
from the accumulated design work of generation N, so improvements compound
instead of being re-derived every round.

---

## Choosing a winner

```bash
designlab choose 1 C --feedback "C wins overall. I prefer A's map and B's profile."
```

This does three things:

1. Records the winner on the round and marks it `chosen`.
2. Appends an entry to the project's lineage.
3. Produces and saves a **next-generation plan**.

A candidate can only win if it has a committed implementation and did not
fail. Choosing a broken candidate would make it the base commit of every
design in the next generation.

---

## The key mechanic

The winner's **branch**, not the original base branch, becomes the base commit
for the next round.

```
main@abc123
   ├── design/r001-a-immersive
   ├── design/r001-b-social
   ├── design/r001-c-premium   ★ winner
   └── design/r001-d-utility

design/r001-c-premium@def456          ← generation 2's base
   ├── design/r002-a-refined
   ├── design/r002-b-with-a-map
   └── design/r002-c-radical
```

`designlab round` detects this automatically: if the previous round has a
winner and a saved plan, it bases itself on the winner and records
`parentRound` / `parentSlot`.

---

## Feedback parsing

Free-text feedback is parsed **deterministically** for sibling references, so
a borrowing you asked for becomes a recorded requirement rather than something
a model might forget.

Recognised forms:

| You write | Parsed as |
| --- | --- |
| `A's map` | borrow *map* from A |
| `B's profile screen` | borrow *profile screen* from B |
| `take the map from A` | borrow *map* from A |
| `design B was close` | B mentioned |

Subject extraction stops at verbs, conjunctions and sentence boundaries, so
`A's map is the best part` yields *map*, not the rest of the sentence. A bare
capital letter in ordinary prose (`A better result overall`) does **not**
create a phantom borrowing — a possessive or an explicit `from X` is required.

---

## Next-generation planning

Fable receives the winning brief, the rejected siblings' briefs and review
scores, your feedback, the parsed borrowings, and the lineage history. It
returns directions spanning a range of risk:

| Risk | Shape |
| --- | --- |
| `conservative` | Refine the winner without changing its structure |
| `moderate` | Keep the winner, graft a specific idea from a rejected sibling |
| `radical` | Push the winning thesis to its structural extreme |

Those categories are guidance, not a fixed menu — Fable decides what is worth
exploring for this product. Borrowings you named explicitly are requirements,
and DesignLab re-attaches any the model omitted.

**If the lead agent is unavailable**, a deterministic fallback plan is used
instead: refine the winner, graft each requested borrowing, probe one radical
alternative. `designlab choose` stays useful even when models are not
reachable.

---

## Lineage record

```jsonc
{
  "projectId": "you-app-1a2b3c4d",
  "entries": [
    {
      "round": 1,
      "parentRound": null,
      "parentSlot": null,
      "baseSha": "abc123…",
      "winner": "C",
      "winnerBranch": "design/r001-c-premium",
      "feedback": "C wins overall. I prefer A's map and B's profile.",
      "candidateSlots": ["A", "B", "C", "D"],
      "chosenAt": "2026-08-14T10:00:00.000Z"
    }
  ]
}
```

Re-choosing a round replaces its entry rather than duplicating it, so
`designlab choose 1 A` after `designlab choose 1 C` is a correction, not a
second history.

---

## Practical notes

- **Losing designs are not wasted.** A rejected design often contains one
  subsystem that beat the winner. Naming it in your feedback is how it
  survives.
- **Be specific.** "C is better" produces a weaker next generation than "C
  wins because the density suits one-handed use, but A's map reads better at a
  glance."
- **Rejected directions are not repeated** unless your feedback asks for them.
- **Design branches are never deleted** by DesignLab. Every generation stays
  inspectable and installable.
