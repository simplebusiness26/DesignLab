#!/usr/bin/env python3
"""Materialize DesignLab 2.0 knowledge files from chunked gzip registries.

Run from the repository root:
    python knowledge/registry/materialize.py

The script validates every transport chunk and every reconstructed knowledge
file before writing it under the repository's knowledge/ directory. It is safe
to rerun; generated files are replaced only with checksum-verified content from
the registries.
"""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
KNOWLEDGE_ROOT = HERE.parent
MANIFEST = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def materialize_registry(reg: dict) -> int:
    payload = bytearray()
    for chunk in reg["chunks"]:
        p = HERE / "chunks" / chunk["name"]
        data = p.read_bytes()
        actual = sha256(data)
        if actual != chunk["sha256"]:
            raise SystemExit(
                f"chunk checksum mismatch: {p}: expected {chunk['sha256']}, got {actual}"
            )
        payload.extend(data)

    compressed = bytes(payload)
    if sha256(compressed) != reg["gzip_sha256"]:
        raise SystemExit(f"registry gzip checksum mismatch: {reg['name']}")

    raw = gzip.decompress(compressed)
    registry = json.loads(raw.decode("utf-8"))
    if registry.get("version") != MANIFEST["version"] or registry.get("group") != reg["name"]:
        raise SystemExit(f"unexpected registry metadata: {reg['name']}")

    count = 0
    for rel_path, content in registry["files"].items():
        encoded = content.encode("utf-8")
        expected = registry["sha256"][rel_path]
        actual = sha256(encoded)
        if actual != expected:
            raise SystemExit(
                f"file checksum mismatch before write: {rel_path}: expected {expected}, got {actual}"
            )
        target = KNOWLEDGE_ROOT / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        if sha256(target.read_bytes()) != expected:
            raise SystemExit(f"file checksum mismatch after write: {rel_path}")
        count += 1
    return count


def main() -> None:
    total = 0
    for reg in MANIFEST["registries"]:
        total += materialize_registry(reg)
    expected = MANIFEST["file_count"]
    if total != expected:
        raise SystemExit(f"materialized {total} files; expected {expected}")
    print(f"DesignLab 2.0 knowledge materialized and verified: {total} files")


if __name__ == "__main__":
    main()
