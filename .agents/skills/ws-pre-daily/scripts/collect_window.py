#!/usr/bin/env python3
"""Collect git / plan / changelog evidence for a rolling hours window."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

TITLE_RE = re.compile(r"^(?:\*\*title:\*\*|title:)\s*(.+)$", re.I | re.M)
USID_RE = re.compile(r"^(?:\*\*usId:\*\*|usId:|slug:|us:)\s*(.+)$", re.I | re.M)
STEP_RE = re.compile(r"^(?:\*\*currentStep:\*\*|currentStep:)\s*(\S+)", re.I | re.M)
BRANCH_RE = re.compile(r"^(?:\*\*branch:\*\*|branch:)\s*(.+)$", re.I | re.M)
PR_RE = re.compile(
    r"^(?:\*\*(?:pr(?:Number|Url|Id)?|prUrl):\*\*|(?:pr(?:Number|Url|Id)?|prUrl):)\s*(.+)$",
    re.I | re.M,
)
CHANGELOG_RE = re.compile(
    r"^###? \[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)\](.*)$", re.M
)


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


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(raw: str) -> datetime | None:
    text = raw.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def run_git(repo: Path, args: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(repo),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def git_ok(repo: Path, args: list[str]) -> str:
    code, out, _ = run_git(repo, args)
    return out if code == 0 else ""


def detect_base(repo: Path) -> str:
    code, out, _ = run_git(repo, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])
    if code == 0 and out:
        name = out.split("/")[-1]
        for candidate in (name, f"origin/{name}"):
            c, _, _ = run_git(repo, ["rev-parse", "--verify", candidate])
            if c == 0:
                return candidate
    for name in ("master", "main", "develop"):
        code, _, _ = run_git(repo, ["rev-parse", "--verify", name])
        if code == 0:
            return name
        code, _, _ = run_git(repo, ["rev-parse", "--verify", f"origin/{name}"])
        if code == 0:
            return f"origin/{name}"
    return "HEAD"


def parse_commits(raw: str) -> list[dict]:
    rows: list[dict] = []
    if not raw:
        return rows
    for line in raw.splitlines():
        parts = line.split("\x1f")
        if len(parts) < 5:
            continue
        rows.append(
            {
                "hash": parts[0],
                "short": parts[0][:7],
                "committedAt": parts[1],
                "authorName": parts[2],
                "authorEmail": parts[3],
                "subject": parts[4],
                "refs": parts[5] if len(parts) > 5 else "",
            }
        )
    return rows


def collect_git(
    repo: Path, since: datetime, until: datetime, author: str | None
) -> dict:
    since_iso = iso_utc(since)
    until_iso = iso_utc(until)
    log_fmt = "%H%x1f%cI%x1f%an%x1f%ae%x1f%s%x1f%D"
    log_args = [
        "log",
        "--all",
        f"--since={since_iso}",
        f"--until={until_iso}",
        f"--pretty=format:{log_fmt}",
    ]
    if author:
        log_args.append(f"--author={author}")
    all_commits = parse_commits(git_ok(repo, log_args))

    base = detect_base(repo)
    base_args = [
        "log",
        base,
        f"--since={since_iso}",
        f"--until={until_iso}",
        f"--pretty=format:{log_fmt}",
    ]
    if author:
        base_args.append(f"--author={author}")
    on_base = {c["hash"] for c in parse_commits(git_ok(repo, base_args))}
    for c in all_commits:
        c["onBase"] = c["hash"] in on_base

    branch = git_ok(repo, ["rev-parse", "--abbrev-ref", "HEAD"])
    porcelain = git_ok(repo, ["status", "--porcelain=v1", "-b"])
    dirty = [
        line
        for line in porcelain.splitlines()
        if line and not line.startswith("##")
    ]
    return {
        "baseBranch": base,
        "currentBranch": branch,
        "authorFilter": author,
        "commits": all_commits,
        "dirty": dirty,
        "statusHead": porcelain.splitlines()[0] if porcelain else "",
    }


def extract_field(text: str, rx: re.Pattern[str]) -> str | None:
    m = rx.search(text)
    if not m:
        return None
    val = m.group(1).strip().strip("*").strip()
    if (val.startswith('"') and val.endswith('"')) or (
        val.startswith("'") and val.endswith("'")
    ):
        val = val[1:-1].strip()
    return val


def collect_plans(plans_dir: Path, since: datetime, until: datetime) -> list[dict]:
    if not plans_dir.is_dir():
        return []
    since_ts = since.timestamp()
    until_ts = until.timestamp()
    rows: list[dict] = []
    for state in sorted(plans_dir.rglob("*.state.md")):
        try:
            st = state.stat()
        except OSError:
            continue
        mtime = float(st.st_mtime)
        if mtime < since_ts or mtime > until_ts:
            continue
        try:
            text = state.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        rel = str(state.relative_to(plans_dir)).replace("\\", "/")
        rows.append(
            {
                "path": rel,
                "updatedAt": iso_utc(datetime.fromtimestamp(mtime, tz=timezone.utc)),
                "usId": extract_field(text, USID_RE),
                "title": extract_field(text, TITLE_RE),
                "currentStep": extract_field(text, STEP_RE),
                "branch": extract_field(text, BRANCH_RE),
                "pr": extract_field(text, PR_RE),
            }
        )
    return rows


def collect_changelog(path: Path, since: datetime, until: datetime) -> list[dict]:
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    entries: list[dict] = []
    matches = list(CHANGELOG_RE.finditer(text))
    for i, m in enumerate(matches):
        raw_ts = m.group(1)
        dt = parse_iso(raw_ts.replace(" ", "T"))
        if dt is None:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt < since or dt > until:
            continue
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end() : end].strip()
        lines = [ln.strip() for ln in body.splitlines() if ln.strip()][:6]
        entries.append(
            {
                "at": iso_utc(dt),
                "heading": m.group(0).strip(),
                "lines": lines,
            }
        )
    return entries


def main() -> int:
    ensure_utf8_stdio()
    parser = argparse.ArgumentParser(description="Collect pre-daily window evidence")
    parser.add_argument("--hours", type=float, default=36)
    parser.add_argument(
        "--tz",
        default="",
        help="Label only; collector stays UTC ISO (parity with SKILL.md invocation)",
    )
    parser.add_argument("--repo", default=".")
    parser.add_argument("--plans-dir", default="")
    parser.add_argument("--changelog", default="")
    parser.add_argument("--author", default="")
    parser.add_argument("--all-authors", action="store_true")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    until = datetime.now(timezone.utc)
    since = until - timedelta(hours=args.hours)

    code, _, err = run_git(repo, ["rev-parse", "--is-inside-work-tree"])
    if code != 0:
        print(
            json.dumps(
                {"ok": False, "error": "not-a-git-repo", "repo": str(repo), "stderr": err},
                ensure_ascii=False,
            ),
            flush=True,
        )
        return 1

    author = None if args.all_authors else (args.author.strip() or None)
    if author is None and not args.all_authors:
        email = git_ok(repo, ["config", "user.email"])
        name = git_ok(repo, ["config", "user.name"])
        author = email or name or None

    git_data = collect_git(repo, since, until, author)
    plans_dir = Path(args.plans_dir).resolve() if args.plans_dir else None
    changelog = Path(args.changelog).resolve() if args.changelog else None

    result = {
        "ok": True,
        "window": {
            "hours": args.hours,
            "tz": (args.tz or "").strip() or "UTC",
            "sinceIso": iso_utc(since),
            "untilIso": iso_utc(until),
        },
        "git": git_data,
        "plans": collect_plans(plans_dir, since, until) if plans_dir else [],
        "changelog": collect_changelog(changelog, since, until) if changelog else [],
        "gaps": [],
    }
    if plans_dir is None:
        result["gaps"].append("plans-dir-not-passed")
    elif not plans_dir.is_dir():
        result["gaps"].append("plans-dir-missing")
    if changelog is None:
        result["gaps"].append("changelog-not-passed")
    elif not changelog.is_file():
        result["gaps"].append("changelog-missing")

    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
