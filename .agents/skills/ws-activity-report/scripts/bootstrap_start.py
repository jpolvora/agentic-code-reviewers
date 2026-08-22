#!/usr/bin/env python3
"""Resolve billing start time from earliest bootstrap file creation in a plan folder."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

CANDIDATE_GLOBS = (
    ".runtime/started-at.txt",
    ".runtime/workflow-id.txt",
    ".runtime/baseline.txt",
)

NAME_PATTERNS = (
    re.compile(r".*\.state\.md$", re.I),
    re.compile(r"^step-00-.*\.(issue\.json|spec\.md|classify\.md)$", re.I),
    re.compile(r"^.*\.issue\.json$", re.I),
)

STARTED_AT_RE = re.compile(
    r"^startedAt:\s*[\"']?([^\"'\n#]+)", re.M | re.I
)


def creation_ts(path: Path) -> float | None:
    try:
        st = path.stat()
    except OSError:
        return None
    # Windows: st_ctime is creation. Unix: prefer birthtime when available.
    if os.name == "nt":
        return float(st.st_ctime)
    birth = getattr(st, "st_birthtime", None)
    if birth is not None:
        return float(birth)
    return float(st.st_ctime)


def iso_utc(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def list_candidates(us_dir: Path) -> list[Path]:
    found: list[Path] = []
    for rel in CANDIDATE_GLOBS:
        p = us_dir / rel
        if p.is_file():
            found.append(p)
    for p in sorted(us_dir.iterdir()) if us_dir.is_dir() else []:
        if not p.is_file():
            continue
        name = p.name
        if any(rx.match(name) for rx in NAME_PATTERNS):
            if p not in found:
                found.append(p)
    return found


def read_started_at(us_dir: Path) -> tuple[str | None, float | None]:
    states = sorted(us_dir.glob("*.state.md")) + sorted(
        us_dir.glob("*.archive/*.state.md")
    )
    for state in states:
        try:
            text = state.read_text(encoding="utf-8")
        except OSError:
            continue
        m = STARTED_AT_RE.search(text)
        if not m:
            continue
        raw = m.group(1).strip().strip('"').strip("'")
        try:
            # Support Z and offset forms
            normalized = raw.replace("Z", "+00:00")
            dt = datetime.fromisoformat(normalized)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return raw, dt.timestamp()
        except ValueError:
            return raw, None
    return None, None


def resolve(us_dir: Path) -> dict:
    candidates = list_candidates(us_dir)
    rows = []
    for p in candidates:
        ts = creation_ts(p)
        if ts is None:
            continue
        rows.append(
            {
                "path": str(p.relative_to(us_dir)).replace("\\", "/"),
                "creationIso": iso_utc(ts),
                "creationTs": ts,
            }
        )
    started_raw, started_ts = read_started_at(us_dir)
    if not rows:
        return {
            "ok": False,
            "error": "no-bootstrap-candidates",
            "usDir": str(us_dir),
            "startedAt": started_raw,
            "candidates": [],
        }

    earliest = min(rows, key=lambda r: r["creationTs"])
    start_ts = earliest["creationTs"]
    start_iso = earliest["creationIso"]
    first_file = earliest["path"]
    override = None

    # Bulk sync: all creations within same second and startedAt materially earlier
    seconds = {int(r["creationTs"]) for r in rows}
    if (
        started_ts is not None
        and len(rows) >= 2
        and len(seconds) == 1
        and started_ts < start_ts - 60
    ):
        start_ts = started_ts
        start_iso = iso_utc(started_ts)
        override = "startedAt"

    return {
        "ok": True,
        "usDir": str(us_dir),
        "startIso": start_iso,
        "firstFile": first_file,
        "override": override,
        "startedAt": started_raw,
        "candidates": [
            {"path": r["path"], "creationIso": r["creationIso"]} for r in rows
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Earliest bootstrap creation time for a plan folder"
    )
    parser.add_argument("us_dir", help="Path to {us-dir} under plans.dir")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON (default)",
        default=True,
    )
    args = parser.parse_args()
    us_dir = Path(args.us_dir).resolve()
    if not us_dir.is_dir():
        print(
            json.dumps({"ok": False, "error": "not-a-directory", "usDir": str(us_dir)}),
            flush=True,
        )
        return 1
    result = resolve(us_dir)
    print(json.dumps(result, ensure_ascii=True), flush=True)
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    sys.exit(main())
