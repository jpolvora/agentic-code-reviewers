#!/usr/bin/env python3
"""
Prior-work sweep for GitHub: search PRs and recent commits.

Usage:
  python sweep_prior_work.py --keywords auth login [--issue 1234] [--files path/a path/b]
  python sweep_prior_work.py --dry-run --keywords test

stdout: JSON with repo-relative paths only. validate-auth first.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


def ensure_utf8_stdio() -> None:
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

HUB_REL = Path(".agents") / "skills" / "ws-shared" / "config.json"


def resolve_repo_root(override: str | None = None) -> Path:
    if override:
        return Path(override).expanduser().resolve()
    cwd = Path.cwd().resolve()
    if (cwd / HUB_REL).is_file():
        return cwd
    return Path(__file__).resolve().parents[4]


def to_repo_relative(repo_root: Path, path: str | Path) -> str:
    p = Path(path)
    try:
        rel = p.resolve().relative_to(repo_root.resolve())
        return rel.as_posix()
    except ValueError:
        s = str(path).replace("\\", "/")
        if re.match(r"^[A-Za-z]:/", s):
            return Path(s).name
        return s.lstrip("/")


def run_gh(args: list[str], repo_root: Path) -> tuple[int, str, str]:
    proc = subprocess.run(
        ["gh", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def validate_auth(repo_root: Path, dry_run: bool) -> tuple[bool, str]:
    code, _out, err = run_gh(["auth", "status"], repo_root)
    if code == 0:
        return True, ""
    msg = (err or _out or "gh auth status failed").strip()
    if dry_run:
        return False, msg
    print(msg, file=sys.stderr)
    print("Fix: gh auth login (or set GH_TOKEN / GITHUB_TOKEN)", file=sys.stderr)
    return False, msg


def search_prs(repo_root: Path, query: str, dry_run: bool, auth_ok: bool) -> list[dict[str, Any]]:
    if dry_run and not auth_ok:
        return []
    code, out, _err = run_gh(
        ["pr", "list", "--search", query, "--state", "all", "--json", "number,title,state,url,headRefName"],
        repo_root,
    )
    if code != 0:
        return []
    try:
        rows = json.loads(out or "[]")
    except json.JSONDecodeError:
        return []
    result = []
    for row in rows if isinstance(rows, list) else []:
        result.append(
            {
                "number": row.get("number"),
                "pullRequestId": row.get("number"),
                "title": row.get("title"),
                "state": row.get("state"),
                "status": row.get("state"),
                "url": row.get("url"),
                "headRefName": row.get("headRefName"),
                "sourceRefName": row.get("headRefName"),
                "searchQuery": query,
            }
        )
    return result


def git_log(repo_root: Path, files: list[str]) -> list[dict[str, str]]:
    if not files:
        return []
    rel_files = [to_repo_relative(repo_root, f) for f in files]
    proc = subprocess.run(
        ["git", "log", "--oneline", "-20", "--", *rel_files],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        return []
    commits = []
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split(" ", 1)
        commits.append({"sha": parts[0], "subject": parts[1] if len(parts) > 1 else "", "files": rel_files})
    return commits


def main() -> int:
    parser = argparse.ArgumentParser(description="Sweep prior work on GitHub (PR search + git log)")
    parser.add_argument("--issue", type=int, default=None, help="Tracker issue number (optional)")
    parser.add_argument("--keywords", nargs="+", default=[], help="Keyword variants for PR search")
    parser.add_argument("--files", nargs="*", default=[], help="Paths for git log (optional)")
    parser.add_argument("--repo-root", default=None, help="Consumer repo root")
    parser.add_argument("--dry-run", action="store_true", help="Advisory mode; skip remote when auth missing")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    auth_ok, auth_msg = validate_auth(repo_root, args.dry_run)
    if not auth_ok and not args.dry_run:
        return 1
    if not auth_ok and args.dry_run:
        payload = {
            "status": "skipped",
            "reason": auth_msg or "gh auth not configured",
            "provider": "github",
            "issue": args.issue,
            "keywords": args.keywords,
            "pullRequests": [],
            "commits": git_log(repo_root, args.files),
            "repoRoot": ".",
        }
        print(json.dumps(payload, indent=2))
        return 0

    prs: list[dict[str, Any]] = []
    seen: set[int | None] = set()
    if args.issue is not None:
        for row in search_prs(repo_root, f"#{args.issue}", args.dry_run, auth_ok):
            num = row.get("number")
            if num not in seen:
                seen.add(num)
                prs.append(row)
    kw = " ".join(args.keywords).strip()
    if kw:
        for row in search_prs(repo_root, kw, args.dry_run, auth_ok):
            num = row.get("number")
            if num not in seen:
                seen.add(num)
                prs.append(row)
        for row in search_prs(repo_root, f"{kw} is:open", args.dry_run, auth_ok):
            num = row.get("number")
            if num not in seen:
                seen.add(num)
                prs.append(row)

    payload = {
        "status": "ok",
        "provider": "github",
        "issue": args.issue,
        "keywords": args.keywords,
        "pullRequests": prs,
        "commits": git_log(repo_root, args.files),
        "repoRoot": ".",
    }
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
