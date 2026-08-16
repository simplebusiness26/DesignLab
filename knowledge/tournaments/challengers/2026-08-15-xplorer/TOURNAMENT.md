# Xplorer Challenger Tournament B

Status: ACTIVE / SEPARATE FROM TOURNAMENT A
Date: 2026-08-15
Source product: `simplebusiness26/The-App`
Source branch at freeze: `main2.0-Dev`
**Frozen source commit: `78632b12eeb4e4123b1a767c8b815fe6617681f9`**
**Frozen source tree: `d6aa748c66cf90ee5637e793d71feaa6b4cf399a`**

## Purpose

Keep the original four-persona full-app tournament intact and run a second, independent whole-app tournament with a new challenger roster. Tournament B does not overwrite, supersede or modify Tournament A.

The goal is seven independent answers to:

> **Given everything Xplorer genuinely does at the same frozen source commit, what should the best possible version of Xplorer become?**

## Locked shared Product Truth package

Every challenger MUST receive these exact shared inputs before its persona-specific work begins:

1. `MASTER_PRODUCT_BRIEF.md`
2. `PRODUCT_TRUTH_ANNEX.md`
3. `PRODUCT_TRUTH.json`
4. `knowledge/prototypes/FULL_APP_HTML_STANDARD.md`
5. `knowledge/ANTI_IMITATION_STANDARD.md`
6. `knowledge/PERSONA_PERFECT_10_GATE.md`

The three Tournament B Product Truth files are persona-neutral and may not be rewritten per challenger.

The candidate must also inspect the actual Xplorer repository at the frozen SHA. The shared package is an authoritative guide to the frozen product, not permission to skip code inspection.

### Truth precedence

If anything conflicts, use:

1. frozen source code;
2. frozen Supabase migrations/database rules;
3. frozen tests/deterministic verification gates;
4. current repository laws where consistent with code;
5. the locked Tournament B Product Truth package;
6. older inventories/plans only where still current.

Do not use the moving head of `main2.0-Dev` after the tournament starts. If the source baseline is intentionally changed, regenerate the shared truth package and restart all challengers from the new common SHA.

## Shared rules

Every challenger receives the same Product Truth, route/capability facts, benchmark journeys and whole-app review contract.

Every candidate must represent the complete app coherently rather than redesigning a single isolated screen.

Candidates may redesign layout, navigation architecture, hierarchy, interaction language, density, visual system and motion philosophy, but may not invent product capabilities, account models, permissions or backend behaviour.

Current routes are evidence of implemented capability, not a command to preserve today’s screen grouping. Navigation reorganisation is explicitly allowed when Product Truth remains intact.

## Challenger roster

1. **Katie Dill** — whole-service journeys, trust, human experience and digital-to-real-world handoff.
2. **Alex Schleifer** — product journey, systems, cross-disciplinary product building and real-world outcomes.
3. **Karri Saarinen** — context/fit, coherent product systems, signal over noise and implementation-aware craft.
4. **Rauno Freiberg** — direct manipulation, interaction mechanics, responsiveness, prototyping and purposeful motion.
5. **Rasmus Andersson** — product architecture, data/state models, executable prototyping and deep functional craft.
6. **Talia Cotton** — meaningful computational systems, authored variability, data-reactive expression and scalable generators.
7. **Emil Kowalski** — immediate feedback, frequency-aware motion, performance, accessibility and motion restraint.

Each challenger must load only its own `PERSONA_PACK.md` on top of the same shared Product Truth package.

## Execution structure — sequential and independent

Tournament B runs **one challenger at a time** for focus and quality.

Every challenger begins from the exact same untouched Xplorer source SHA:

```text
XPLORER 78632b12...
 ├─ Katie Dill
 ├─ Alex Schleifer
 ├─ Karri Saarinen
 ├─ Rauno Freiberg
 ├─ Rasmus Andersson
 ├─ Talia Cotton
 └─ Emil Kowalski
```

Candidate 2 must not inherit Candidate 1. Candidate 3 must not inherit Candidate 2. No challenger receives another challenger’s design or reasoning.

For each challenger:

1. lock the frozen source SHA;
2. load the shared Product Truth package;
3. load that challenger’s Persona Pack;
4. inspect Xplorer code relevant to the persona’s reasoning;
5. build the persona-required internal model/intake;
6. diagnose the whole product before styling;
7. design the complete coherent Xplorer candidate;
8. test the common benchmark journeys and important states;
9. run persona-specific self-review;
10. run Product Truth/invariant checks;
11. run the global Perfect-10 gate;
12. revise until every category is independently defensible at 5/5;
13. freeze that candidate and its standalone review artifact;
14. only then begin the next challenger.

## Product Truth blocking rule

A candidate is blocked if it does any of the following:

- invents or removes a material capability;
- makes Manager a separate identity;
- changes friendship away from mutual follows;
- conflates Moment and Memory lifecycles;
- breaks Check-in/public-place/presence rules;
- widens privacy or exposes attendee-only information;
- bypasses camera-first Moment/Memory creation as if upload-first creation currently exists;
- weakens Claim/Admin ownership boundaries;
- invents future product features;
- represents only showcase screens while leaving major route/capability families unresolved.

`PRODUCT_TRUTH_ANNEX.md` contains the detailed candidate truth-check checklist.

## Tournament structure

- Tournament A remains untouched.
- Tournament B is reviewed independently first.
- No candidate becomes authoritative until the user explicitly locks it.
- The user may select whole candidates or individual ideas/subsystems.
- A later Champions Round may use selected strengths from A and B.
- Synthesis means a new coherent design, not a literal merge of seven competing codebases.

## Review surface

Each challenger is delivered as a standalone, mobile-friendly, whole-app HTML candidate that meets `FULL_APP_HTML_STANDARD.md`.

After all seven are frozen, build a combined Tournament B review surface that lets the user experience and compare:

- Katie
- Alex
- Karri
- Rauno
- Rasmus
- Talia
- Emil

The user must be able to judge complete versions of Xplorer rather than isolated hero screens.

## Fairness rule

The only intended variable across the seven candidates is the professional reasoning lens.

The frozen product, factual constraints, benchmark scenarios, anti-imitation rules, review standard and DesignLab quality gate remain identical for all seven.
