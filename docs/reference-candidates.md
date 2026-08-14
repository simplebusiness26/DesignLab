# Reference-image candidates

You can hand DesignLab your own UI mockups — one image or a coherent pack —
and it will implement them as a first-class candidate competing against
Fable's explorations:

```bash
designlab round --designs 4 --reference ./references/my-concept/
```

That round runs **five** candidates: slot A implements your mockups; B–E are
Fable explorations, each steered (and scored) to be structurally distinct
from the reference as well as from each other.

```
references/my-concept/
  home.png
  map.png
  discover.png
  profile.png
```

Supported: `.png`, `.jpg`, `.webp`; up to 12 images, 20 MB each. A single
image file works too.

## How it flows

```
reference images
  → visual interpretation (lead model views each image)
  → structured Reference Design Brief (slot A, origin: REFERENCE_IMAGE)
  → the SAME pipeline as every candidate:
    worktree → builder → protection gate → verification → review → APK
```

The interpreter extracts what is *visible*: composition, hierarchy,
navigation presentation, spacing, density, typography, component treatment,
icon and map presentation, and interactions where the affordances make them
reasonable to infer. The review stage then judges the implementation's
fidelity against the original mockups, not just the text brief.

## Epistemic rules

An image shows presentation. It cannot show behaviour.

- The interpreter must list what the images do **not** establish
  (`uncertainties`); those become explicit "keep existing behaviour" clauses
  in the builder's brief.
- Inventing flows, data, permissions or backend behaviour from an image is a
  contract violation like any other — the reference candidate passes the
  same protection gate as everyone else.
- The existing application remains the source of truth for what the app
  does. A reference changes presentation, not product behaviour.

## Lineage

Origin is tracked everywhere: the brief and candidate carry
`origin: REFERENCE_IMAGE` plus the image paths, and lineage records
`referenceSlots` per round — so "the human's design beat three explorations
in round 4" is a queryable fact. If the reference candidate wins, the next
generation evolves from it exactly as from any winner.
