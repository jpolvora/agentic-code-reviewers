#!/usr/bin/env python3
"""
Post a tracker comment on GitHub (comment-issue intent).

Usage:
  python comment_issue.py --id 1234 --body-file comment.md [--dry-run]
  python comment_issue.py --id null --dry-run   # skipped (local tracker)
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

_SHARED_SCRIPTS = Path(__file__).resolve().parents[2] / "ws-shared" / "scripts"
if str(_SHARED_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SHARED_SCRIPTS))
from resolve_consumer_root import resolve_repo_root  # noqa: E402


def ensure_utf8_stdio() -> None:
    import os

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

def validate_auth(repo_root: Path) -> bool:
    proc = subprocess.run(
        ["gh", "auth", "status"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        print((proc.stderr or proc.stdout or "gh auth status failed").strip(), file=sys.stderr)
        print("Fix: gh auth login (validate-auth)", file=sys.stderr)
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Comment on GitHub issue (comment-issue)")
    parser.add_argument("--id", required=True, help="Issue id or null")
    parser.add_argument("--body-file", default=None, help="Comment body file")
    parser.add_argument("--body", default=None, help="Comment body inline")
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    issue_raw = str(args.id).strip().lower()
    if issue_raw in ("null", "none", ""):
        print(json.dumps({"status": "skipped", "reason": "no tracker id"}))
        return 0

    try:
        issue_id = int(args.id)
    except ValueError:
        print(json.dumps({"status": "skipped", "reason": "invalid tracker id"}))
        return 0

    body = ""
    if args.body_file:
        body = Path(args.body_file).read_text(encoding="utf-8")
    elif args.body:
        body = args.body
    else:
        print("Missing --body-file or --body", file=sys.stderr)
        return 1

    repo_root = resolve_repo_root(args.repo_root, script_file=__file__)
    if args.dry_run:
        print(json.dumps({"status": "dry-run", "issueId": issue_id, "body": body.strip()}))
        return 0

    if not validate_auth(repo_root):
        return 1

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, suffix=".md") as tmp:
        tmp.write(body)
        tmp_path = tmp.name

    try:
        proc = subprocess.run(
            ["gh", "issue", "comment", str(issue_id), "--body-file", tmp_path],
            cwd=repo_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        return proc.returncode
    print(json.dumps({"status": "ok", "issueId": issue_id}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
