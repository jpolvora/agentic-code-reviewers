#!/usr/bin/env python3
"""
self_learning.py -- Compile and query memory entries to prevent merge conflicts.

Usage:
    python self_learning.py --compile
    python self_learning.py --query <keyword>
"""

import os
import re
import sys
import fnmatch
import argparse
from pathlib import Path
from datetime import datetime

_SHARED_SCRIPTS = Path(__file__).resolve().parents[2] / "ws-shared" / "scripts"
if str(_SHARED_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SHARED_SCRIPTS))
from resolve_consumer_root import resolve_repo_root, shared_dir  # noqa: E402


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

_REPO_ROOT = resolve_repo_root(script_file=__file__)
SHARED_DIR = shared_dir(_REPO_ROOT)
MEMORY_DIR = SHARED_DIR / "memory"
COMPILED_MEMORY_PATH = SHARED_DIR / "MEMORY.md"


def parse_memory_file(file_path: Path) -> dict:
    """Parses an individual memory markdown file."""
    content = file_path.read_text(encoding="utf-8")
    
    # Try to parse date and title from the first header
    # e.g., ### [2026-07-12] user-gate must be FORCE-invoked at gates
    header_match = re.search(r"^###\s+\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$", content, re.MULTILINE)
    
    if header_match:
        date_str = header_match.group(1)
        title = header_match.group(2).strip()
    else:
        # Fallback to parsing date from the filename: YYYY-MM-DD-something.md
        filename_match = re.match(r"^(\d{4}-\d{2}-\d{2})[_-](.*)$", file_path.stem)
        if filename_match:
            date_str = filename_match.group(1)
            title = filename_match.group(2).replace("-", " ").replace("_", " ").title()
        else:
            date_str = datetime.now().strftime("%Y-%m-%d")
            title = file_path.stem.replace("-", " ").replace("_", " ").title()
            
        # If no explicit header was matched, we might have a simple header like: ### Title
        simple_header_match = re.search(r"^###\s+(?!\[\d{4}-\d{2}-\d{2}\])(.*)$", content, re.MULTILINE)
        if simple_header_match:
            title = simple_header_match.group(1).strip()

    # Parse key-value lists
    layer = ""
    module = ""
    severity = ""
    path_pattern = ""
    scenario_context = ""
    do_not = ""
    instead_do = ""
    trap_avoided = ""
    solution = ""
    
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("- **Layer**:") or line.startswith("- **Layer**:"):
            layer = re.sub(r"^-\s*\*\*Layer\*\*:\s*", "", line).strip().strip("`")
        elif line.startswith("- **Module**:") or line.startswith("- **Module**:"):
            module = re.sub(r"^-\s*\*\*Module\*\*:\s*", "", line).strip().strip("`")
        elif line.startswith("- **Severity**:") or line.startswith("- **Severity**:"):
            severity = re.sub(r"^-\s*\*\*Severity\*\*:\s*", "", line).strip().strip("`")
        elif line.startswith("- **PathPattern**:") or line.startswith("- **Path Pattern**:") or line.startswith("- **PathPatterns**:") or line.startswith("- **Path**:") or line.startswith("- **Paths**:"):
            path_pattern = re.sub(r"^-\s*\*\*(?:PathPattern|Path Pattern|PathPatterns|Path|Paths)\*\*:\s*", "", line).strip().strip("`")
        elif line.startswith("- **Scenario / Context**:") or line.startswith("- **Scenario/Context**:") or line.startswith("- **Context**:") or line.startswith("- **Scenario**:"):
            scenario_context = re.sub(r"^-\s*\*\*(?:Scenario\s*/\s*Context|Scenario/Context|Context|Scenario)\*\*:\s*", "", line).strip()
        elif line.startswith("- **DO NOT**:") or line.startswith("- **Do Not**:") or line.startswith("- **DO_NOT**:") or line.startswith("- **Trap Avoided**:"):
            do_not = re.sub(r"^-\s*\*\*(?:DO NOT|Do Not|DO_NOT|Trap Avoided)\*\*:\s*", "", line).strip()
        elif line.startswith("- **INSTEAD DO**:") or line.startswith("- **Instead Do**:") or line.startswith("- **INSTEAD_DO**:") or line.startswith("- **Solution**:"):
            instead_do = re.sub(r"^-\s*\*\*(?:INSTEAD DO|Instead Do|INSTEAD_DO|Solution)\*\*:\s*", "", line).strip()

    return {
        "file_name": file_path.name,
        "date": date_str,
        "title": title,
        "layer": layer,
        "module": module,
        "severity": severity,
        "path_pattern": path_pattern,
        "scenario_context": scenario_context,
        "do_not": do_not,
        "instead_do": instead_do,
        "trap_avoided": do_not,
        "solution": instead_do,
        "full_text": content.strip()
    }


def compile_memory() -> None:
    """Compiles all markdown files under memory/ into a single MEMORY.md."""
    if not MEMORY_DIR.exists():
        MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        
    entries = []
    for file in MEMORY_DIR.glob("*.md"):
        if file.name.startswith("."):
            continue
        try:
            entry = parse_memory_file(file)
            entries.append(entry)
        except Exception as e:
            print(f"Warning: Failed to parse {file.name}: {e}", file=sys.stderr)
            
    # Sort entries by date descending, then title alphabetically
    entries.sort(key=lambda x: (x["date"], x["title"]), reverse=True)
    
    header = (
        "# Memory - Anti-Regression Knowledge\n\n"
        "This file is auto-generated by the `ws-self-learning` skill. DO NOT edit this file directly.\n"
        "To add new learnings, create a separate markdown file under `{sharedDir}/memory/` and run:\n"
        "  python {skillsRoot}/ws-self-learning/scripts/self_learning.py --compile\n\n"
        "---"
    )
    
    body_parts = [header]
    for entry in entries:
        lines = [f"\n### [{entry['date']}] {entry['title']}"]
        if entry["layer"]:
            lines.append(f"- **Layer**: `{entry['layer']}`")
        if entry["module"]:
            lines.append(f"- **Module**: `{entry['module']}`")
        if entry["severity"]:
            lines.append(f"- **Severity**: `{entry['severity']}`")
        if entry.get("path_pattern"):
            lines.append(f"- **PathPattern**: `{entry['path_pattern']}`")
        if entry.get("scenario_context"):
            lines.append(f"- **Scenario / Context**: {entry['scenario_context']}")
        if entry.get("do_not"):
            lines.append(f"- **DO NOT**: {entry['do_not']}")
        if entry.get("instead_do"):
            lines.append(f"- **INSTEAD DO**: {entry['instead_do']}")
            
        body_parts.append("\n".join(lines))
        
    COMPILED_MEMORY_PATH.write_text("\n".join(body_parts) + "\n", encoding="utf-8")
    print(f"Successfully compiled {len(entries)} memory entries into {COMPILED_MEMORY_PATH}")


def _matches_any_path_pattern(pattern_str: str, file_paths: list[str]) -> bool:
    """Checks if any file path matches any pattern in pattern_str (comma/space separated globs)."""
    if not pattern_str or pattern_str.strip().lower() in ("n/a", "none"):
        return False
    patterns = [p.strip().strip("`").strip("'").strip('"') for p in re.split(r"[,;]", pattern_str) if p.strip()]
    for path in file_paths:
        norm_path = path.replace("\\", "/").strip().lstrip("./")
        path_name = Path(norm_path).name
        for pat in patterns:
            norm_pat = pat.replace("\\", "/").strip().lstrip("./")
            if not norm_pat:
                continue
            if norm_pat == norm_path:
                return True
            if fnmatch.fnmatch(norm_path, norm_pat):
                return True
            if fnmatch.fnmatch(norm_path, f"*/{norm_pat.lstrip('/')}"):
                return True
            if fnmatch.fnmatch(norm_path, f"{norm_pat.rstrip('/')}/*"):
                return True
            if fnmatch.fnmatch(path_name, norm_pat):
                return True
            if norm_pat in norm_path:
                return True
    return False


def match_paths(file_paths: list[str]) -> None:
    """Searches memory entries whose PathPattern matches any of the given file paths."""
    if not MEMORY_DIR.exists():
        print("No memory directory found.")
        return
        
    matches = []
    for file in MEMORY_DIR.glob("*.md"):
        if file.name.startswith("."):
            continue
        try:
            entry = parse_memory_file(file)
            if entry.get("path_pattern") and _matches_any_path_pattern(entry["path_pattern"], file_paths):
                matches.append(entry)
        except Exception:
            pass
            
    matches.sort(key=lambda x: x["date"], reverse=True)
    
    if not matches:
        print(f"No memory entries found matching touched paths: {', '.join(file_paths)}")
        return
        
    print(f"Found {len(matches)} matching memory entry/entries for touched paths:")
    for entry in matches:
        print("=" * 60)
        print(f"[{entry['date']}] {entry['title']} ({entry['file_name']})")
        tags = []
        if entry['layer']:
            tags.append(f"Layer={entry['layer']}")
        if entry['module']:
            tags.append(f"Module={entry['module']}")
        if entry['severity']:
            tags.append(f"Severity={entry['severity']}")
        if entry.get('path_pattern'):
            tags.append(f"PathPattern={entry['path_pattern']}")
        if tags:
            print(f"Tags: {', '.join(tags)}")
        print("-" * 60)
        print(f"Trap Avoided: {entry['trap_avoided']}")
        print(f"Solution: {entry['solution']}")
    print("=" * 60)


def query_memory(keyword: str) -> None:
    """Searches memory entries for matching keywords."""
    if not MEMORY_DIR.exists():
        print("No memory directory found.")
        return
        
    matches = []
    keyword_lower = keyword.lower()
    for file in MEMORY_DIR.glob("*.md"):
        if file.name.startswith("."):
            continue
        try:
            entry = parse_memory_file(file)
            if (keyword_lower in entry["title"].lower() or 
                    keyword_lower in entry["trap_avoided"].lower() or 
                    keyword_lower in entry["solution"].lower() or
                    keyword_lower in entry["layer"].lower() or
                    keyword_lower in entry["module"].lower() or
                    keyword_lower in entry.get("path_pattern", "").lower()):
                matches.append(entry)
        except Exception:
            pass
            
    matches.sort(key=lambda x: x["date"], reverse=True)
    
    if not matches:
        print(f"No memory entries found matching '{keyword}'")
        return
        
    print(f"Found {len(matches)} matching memory entry/entries:")
    for entry in matches:
        print("=" * 60)
        print(f"[{entry['date']}] {entry['title']} ({entry['file_name']})")
        tags = []
        if entry['layer']:
            tags.append(f"Layer={entry['layer']}")
        if entry['module']:
            tags.append(f"Module={entry['module']}")
        if entry['severity']:
            tags.append(f"Severity={entry['severity']}")
        if entry.get('path_pattern'):
            tags.append(f"PathPattern={entry['path_pattern']}")
        if tags:
            print(f"Tags: {', '.join(tags)}")
        print("-" * 60)
        print(f"Trap Avoided: {entry['trap_avoided']}")
        print(f"Solution: {entry['solution']}")
    print("=" * 60)


def main():
    global _REPO_ROOT, SHARED_DIR, MEMORY_DIR, COMPILED_MEMORY_PATH
    parser = argparse.ArgumentParser(description="Self-learning memory compilation and query utility.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--compile", "-c", action="store_true", help="Compile separate memory files into MEMORY.md")
    group.add_argument("--query", "-q", type=str, help="Query memory entries for matching keywords")
    group.add_argument("--match-paths", "-m", nargs="+", help="Query memory entries matching touched file paths or globs")
    parser.add_argument(
        "--repo-root",
        type=str,
        default=None,
        help="Consumer project root (default: cwd hub probe; never global ws-shared sibling)",
    )

    args = parser.parse_args()
    _REPO_ROOT = resolve_repo_root(args.repo_root, script_file=__file__)
    SHARED_DIR = shared_dir(_REPO_ROOT)
    MEMORY_DIR = SHARED_DIR / "memory"
    COMPILED_MEMORY_PATH = SHARED_DIR / "MEMORY.md"
    
    if args.compile:
        compile_memory()
    elif args.query:
        query_memory(args.query)
    elif args.match_paths:
        match_paths(args.match_paths)


if __name__ == "__main__":
    main()

