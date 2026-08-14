# DesignLab 2.0 Knowledge Registry

This directory is the lossless transport format for the validated DesignLab 2.0 knowledge system.

## Why it is chunked
The GitHub connector used to deliver this branch has a conservative payload limit. The knowledge is therefore stored as three gzip-compressed JSON registries split into small binary chunks. This is a transport detail only; no research or persona content is shortened.

## Contents
- `manifest.json` — version, chunk ordering, byte counts and SHA-256 checksums.
- `chunks/` — ordered binary chunks for foundation, UX-persona and visual-persona registries.
- `materialize.py` — reconstructs the exact 73 intended Markdown/JSON knowledge files and verifies every checksum before and after writing.

## Materialize
From the repository root:

```bash
python knowledge/registry/materialize.py
```

Expected output:

```text
DesignLab 2.0 knowledge materialized and verified: 73 files
```

## Runtime use
Normal DesignLab runtime should load the generated `PERSONA_PACK.md` for the active persona plus the relevant Product Truth / Feature Packet context. The large dossiers and source ledgers remain available for targeted retrieval and pack revision, not routine prompt loading.

## Status
The persona packs are `v1.0-rc1`: research-backed and structurally validated, but not promoted to final `v1.0` until the live four-way UX differentiation test passes.
