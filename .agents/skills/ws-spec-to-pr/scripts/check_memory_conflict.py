#!/usr/bin/env python3
"""
check-memory-conflict -- cross-reference a plan file against MEMORY.md entries.

Usage:
    python check_memory_conflict.py <plan_file>
    python check_memory_conflict.py <plan_file> --json    (JSON output)

Given a *.plan.md or *.exec.md, extracts layers, modules, entities and file paths
from the plan, then compares against structured entries in `.agents/skills/ws-shared/MEMORY.md`.

Returns:
  - Exit 0: no overlaps found, or MEMORY.md is absent (consult skipped)
  - Exit 1: plan file missing
  - Exit 2: traps found that overlap the plan scope
"""

import json
import os
import re
import sys
import argparse
import fnmatch
from pathlib import Path



def ensure_utf8_stdio() -> None:
    """Force UTF-8 on stdio so Windows locale (cp1252) does not break on Unicode (e.g. →)."""
    os.environ["PYTHONIOENCODING"] = "utf-8"
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            try:
                reconfigure(errors="replace")
            except Exception:
                pass


ensure_utf8_stdio()


_SHARED_SCRIPTS = Path(__file__).resolve().parents[2] / "ws-shared" / "scripts"
if str(_SHARED_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SHARED_SCRIPTS))


def resolve_memory_path(
    explicit_memory: str | None = None,
    explicit_shared_dir: str | None = None,
    repo_root: str | None = None,
) -> Path:
    if explicit_memory:
        return Path(explicit_memory).expanduser().resolve()
    if explicit_shared_dir:
        return Path(explicit_shared_dir).expanduser().resolve() / "MEMORY.md"

    from resolve_consumer_root import resolve_repo_root, shared_dir

    root = resolve_repo_root(repo_root, script_file=__file__)
    return shared_dir(root) / "MEMORY.md"


# Portable default: no project-specific domain vocabulary.

# Consumers may extend matching via MEMORY.md content; do not hardcode org modules here.
KNOWN_MODULES = []

KNOWN_LAYERS = [
    "Core", "Infrastructure", "Api", "Web", "Tests",
]

_TOKEN_BOUNDARY_BEFORE = r"(?<![a-z0-9])"
_TOKEN_BOUNDARY_AFTER = r"(?![a-z0-9])"


def _module_name_parts(mod: str) -> list[str]:
    parts: list[str] = []
    for chunk in re.split(r"[-\s]+", mod):
        if not chunk:
            continue
        spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", chunk)
        spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", spaced)
        parts.extend(p.lower() for p in spaced.split() if p)
    return parts


def _module_match_pattern(mod: str) -> re.Pattern:
    parts = [re.escape(p) for p in _module_name_parts(mod)]
    if not parts:
        return re.compile(r"(?!x)x")

    def _with_plural(segment: str) -> str:
        return segment + r"s?"

    if len(parts) == 1:
        inner = _with_plural(parts[0])
        pattern = rf"{_TOKEN_BOUNDARY_BEFORE}{inner}{_TOKEN_BOUNDARY_AFTER}"
    else:
        plural_parts = parts[:-1] + [_with_plural(parts[-1])]
        separated = r"[-\s]?".join(plural_parts)
        concatenated = _with_plural("".join(parts))
        pattern = (
            rf"{_TOKEN_BOUNDARY_BEFORE}"
            rf"(?:{separated}|{concatenated})"
            rf"{_TOKEN_BOUNDARY_AFTER}"
        )
    return re.compile(pattern)


def _normalize_for_module_search(text: str) -> str:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", spaced)
    return spaced.lower()


def _text_contains_module(text: str, mod: str) -> bool:
    return _module_match_pattern(mod).search(_normalize_for_module_search(text)) is not None


def _read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _clean_list(val: str) -> list[str]:
    val = val.strip().strip("`")
    return [v.strip().strip("`") for v in val.split(",") if v.strip()]


def parse_memory(path: Path) -> dict:
    text = _read_utf8(path)
    traps = []
    patterns = []
    current = None
    section = None

    for line in text.splitlines(keepends=True):
        sm = re.match(r"^##\s+(Traps|Patterns)", line, re.IGNORECASE)
        if sm:
            section = sm.group(1).lower()
            continue

        hm = re.match(r"^###\s(.+)", line)
        if hm:
            if current:
                (traps if current["type"] == "trap" else patterns).append(current)
            current = {
                "title": hm.group(1).strip(),
                "type": "pattern" if section == "patterns" else "trap",
                "layers": [],
                "modules": [],
                "severity": None,
                "path_patterns": [],
                "text": line,
            }
            continue

        if not current:
            continue

        current["text"] += line

        m = re.match(r"-\s*\*\*Layer\*\*:\s*(.*)", line)
        if m:
            current["layers"] = _clean_list(m.group(1))

        m = re.match(r"-\s*\*\*Module\*\*:\s*(.*)", line)
        if m:
            current["modules"] = _clean_list(m.group(1))

        m = re.match(r"-\s*\*\*Severity\*\*:\s*(.*)", line)
        if m:
            current["severity"] = m.group(1).strip().strip("`").strip()

        m = re.match(r"-\s*\*\*PathPattern\*\*:\s*(.*)", line)
        if m:
            current["path_patterns"] = _clean_list(m.group(1))

    if current:
        (traps if current["type"] == "trap" else patterns).append(current)

    return {"traps": traps, "patterns": patterns}


def extract_plan_keywords(path: Path) -> dict:
    text = _read_utf8(path)

    keywords = {
        "layers": set(),
        "modules": set(),
        "entities": set(),
        "file_paths": set(),
        "us_ids": set(),
    }

    for layer in KNOWN_LAYERS:
        if layer.lower() in text.lower():
            keywords["layers"].add(layer)

    for mod in KNOWN_MODULES:
        if _text_contains_module(text, mod):
            keywords["modules"].add(mod)

    for m in re.finditer(r'(?:src/|web/|tests/)\S+', text):
        path_str = m.group().rstrip('.,;()[]{}*`"\'')
        keywords["file_paths"].add(path_str)

    for m in re.finditer(
        r'\b[A-Z][a-zA-Z0-9]+(?:Service|Controller|Request|Dto|Mapper|Provider)\b',
        text,
    ):
        keywords["entities"].add(m.group())

    for m in re.finditer(r'(?:US|us|#)\s*(\d{3,5})', text):
        keywords["us_ids"].add(m.group(1))

    return {k: sorted(v) for k, v in keywords.items()}


def cross_reference(memory: dict, plan: dict) -> dict:
    plan_layers = set(plan["layers"])
    plan_modules = set(m.lower().replace("-", "") for m in plan["modules"])
    plan_entities = set(e.lower() for e in plan["entities"])
    plan_file_paths = set(p.lower() for p in plan["file_paths"])

    results = {"traps": [], "patterns": []}

    for entry_type in ["traps", "patterns"]:
        for entry in memory[entry_type]:
            entry_layers = set(entry["layers"])
            entry_modules = set(
                m.lower().strip("`").replace("-", "")
                for m in entry["modules"]
            )

            layer_overlap = plan_layers & entry_layers
            module_overlap = plan_modules & entry_modules
            entity_hit = any(e in entry["text"].lower() for e in plan_entities)
            path_hit = any(
                fnmatch.fnmatch(plan_path, pattern.lower().replace("\\", "/"))
                for plan_path in plan_file_paths
                for pattern in entry.get("path_patterns", [])
            ) or any(p in entry["text"].lower() for p in plan_file_paths)

            if layer_overlap or module_overlap or entity_hit or path_hit:
                results[entry_type].append({
                    "title": entry["title"],
                    "type": entry["type"],
                    "severity": entry.get("severity"),
                    "matched_layers": sorted(layer_overlap),
                    "matched_modules": sorted(module_overlap),
                    "entity_match": entity_hit,
                    "path_match": path_hit,
                    "force_interview": (
                        entry_type == "traps"
                        and path_hit
                        and str(entry.get("severity") or "").lower() in {"high", "critical"}
                    ),
                })

    return results


def format_report(plan_path: Path, plan_keywords: dict, results: dict) -> str:
    lines = []
    lines.append("=" * 50)
    lines.append("  check-memory-conflict -- report")
    lines.append("=" * 50)
    lines.append(f"Plan: {plan_path}")
    lines.append("")

    lines.append("## Scope detected in plan")
    lines.append(f"  Layers: {', '.join(plan_keywords['layers']) or '(none)'}")
    lines.append(f"  Modules: {', '.join(plan_keywords['modules']) or '(none)'}")
    entities = plan_keywords["entities"]
    lines.append(f"  Entities/classes: {', '.join(entities[:8]) or '(none)'}")
    if len(entities) > 8:
        lines.append(f"    ... +{len(entities) - 8} more")
    lines.append("")

    total = len(results["traps"]) + len(results["patterns"])
    if total == 0:
        lines.append("[OK] No overlap found -- no entry in MEMORY.md")
        lines.append("   corresponds to the detected scope.")
        return "\n".join(lines)

    lines.append(f"## Alerts ({total} related entry/entries)")
    lines.append("")

    if results["traps"]:
        lines.append("### [TRAPS] (known traps)")
        for t in results["traps"]:
            sev = f" [{t['severity'].upper()}]" if t.get("severity") else ""
            tags = []
            if t["matched_layers"]:
                tags.append(f"layer={','.join(t['matched_layers'])}")
            if t["matched_modules"]:
                tags.append(f"module={','.join(t['matched_modules'])}")
            if t["entity_match"]:
                tags.append("entity")
            if t["path_match"]:
                tags.append("path")
            lines.append(f"  -> {t['title']}{sev}")
            lines.append(f"    match: {', '.join(tags)}")
        lines.append("")

    if results["patterns"]:
        lines.append("### [PATTERNS] (reusable patterns)")
        for p in results["patterns"]:
            tags = []
            if p["matched_layers"]:
                tags.append(f"layer={','.join(p['matched_layers'])}")
            if p["matched_modules"]:
                tags.append(f"module={','.join(p['matched_modules'])}")
            if p["entity_match"]:
                tags.append("entity")
            if p["path_match"]:
                tags.append("path")
            lines.append(f"  -> {p['title']}")
            lines.append(f"    match: {', '.join(tags)}")
        lines.append("")

    return "\n".join(lines)


def main():
    ensure_utf8_stdio()

    parser = argparse.ArgumentParser(description="Cross-reference a plan file against MEMORY.md entries")
    parser.add_argument("plan_file", help="Path to plan file (*.plan.md or *.exec.md)")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of human-readable report")
    parser.add_argument("--memory", default=None, help="Explicit path to MEMORY.md")
    parser.add_argument("--shared-dir", default=None, help="Explicit path to ws-shared directory")
    parser.add_argument("--repo-root", default=None, help="Explicit path to repository root")
    args = parser.parse_args()

    plan_path = Path(args.plan_file)
    if not plan_path.exists():
        print(f"Error: file not found: {plan_path}")
        sys.exit(1)

    memory_path = resolve_memory_path(
        explicit_memory=args.memory,
        explicit_shared_dir=args.shared_dir,
        repo_root=args.repo_root,
    )
    if not memory_path.exists():
        if args.json:
            plan = extract_plan_keywords(plan_path)
            print(json.dumps({
                "plan_keywords": plan,
                "results": {"traps": [], "patterns": []},
                "memory_path": str(memory_path),
                "memory_missing": True,
                "force_interview": False,
            }, ensure_ascii=False, indent=2))
        else:
            print(f"Notice: MEMORY.md not found at {memory_path} (skipping memory conflict check)")
        sys.exit(0)

    memory = parse_memory(memory_path)
    plan = extract_plan_keywords(plan_path)
    results = cross_reference(memory, plan)

    if args.json:
        print(json.dumps({
            "plan_keywords": plan,
            "results": results,
            "memory_path": str(memory_path),
            "force_interview": any(
                item.get("force_interview", False) for item in results["traps"]
            ),
        }, ensure_ascii=False, indent=2))
    else:
        report = format_report(plan_path, plan, results)
        print(report)

    if len(results["traps"]) > 0:
        sys.exit(2)



if __name__ == "__main__":
    main()
