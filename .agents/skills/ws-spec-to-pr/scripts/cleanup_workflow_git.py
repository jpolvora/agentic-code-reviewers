#!/usr/bin/env python3
"""
cleanup_workflow_git — Phase A mandatory git runtime cleanup for one workflow-id.

Removes local uswf/{workflow-id} worktrees, tags, and branches. Never mutates
remotes. Never deletes protected branches (main/master/develop and config
baseBranch/workingBranch). Invoked by orch when status → completed
(shared by standard/lite).

Usage:
    python cleanup_workflow_git.py --workflow-id {id}
    python cleanup_workflow_git.py --workflow-id {id} --dry-run
    python cleanup_workflow_git.py --workflow-id {id} --repo /path --dirty-policy force|stop

Exit codes:
  0  CLEAN (or dry-run with intents logged)
  1  Hard failure or dirty-policy stop
  2  WARN leftovers remain after cleanup
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


def ensure_utf8_stdio() -> None:
    """Force UTF-8 on stdio so Windows locale (cp1252) does not break on Unicode."""
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

# Refuse empty, glob wildcards, or path-traversal-like workflow ids.
_ID_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

# Exact local branch names that must never be deleted (AC11).
_PROTECTED_BRANCH_DEFAULTS = frozenset({"main", "master", "develop"})


def load_config_protected_branches(repo: Path) -> frozenset[str]:
    """Optional extras from project.baseBranch / project.workingBranch."""
    extra: set[str] = set()
    candidates = [
        repo / ".agents" / "skills" / "ws-shared" / "config.json",
        Path.cwd() / ".agents" / "skills" / "ws-shared" / "config.json",
    ]
    for cfg_path in candidates:
        if not cfg_path.is_file():
            continue
        try:
            import json

            data = json.loads(cfg_path.read_text(encoding="utf-8"))
            project = data.get("project") or {}
            for key in ("baseBranch", "workingBranch"):
                val = project.get(key)
                if isinstance(val, str) and val.strip():
                    extra.add(val.strip())
        except Exception:
            continue
        break
    return frozenset(extra)


def is_protected_branch(name: str, *, repo: Path | None = None) -> bool:
    """True for main/master/develop and configured base/working branches."""
    if not name:
        return False
    if name in _PROTECTED_BRANCH_DEFAULTS:
        return True
    if repo is not None and name in load_config_protected_branches(repo):
        return True
    return False


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def validate_workflow_id(workflow_id: str) -> str:
    wid = (workflow_id or "").strip()
    if not wid:
        die("workflow-id must not be empty")
    if "*" in wid or "?" in wid or "[" in wid:
        die(f"workflow-id must not contain glob metacharacters: {wid!r}")
    if "/" in wid or "\\" in wid or ".." in wid:
        die(f"workflow-id must not contain path separators or '..': {wid!r}")
    if not _ID_OK.match(wid):
        die(f"workflow-id has invalid characters: {wid!r}")
    return wid


def git(repo: Path, *args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=check,
    )


def namespace_prefix(workflow_id: str) -> str:
    return f"uswf/{workflow_id}/"


def list_tags(repo: Path, workflow_id: str) -> list[str]:
    prefix = namespace_prefix(workflow_id)
    cp = git(repo, "tag", "-l", f"{prefix}*")
    if cp.returncode != 0:
        die(f"git tag -l failed: {cp.stderr.strip() or cp.stdout.strip()}")
    return [line.strip() for line in cp.stdout.splitlines() if line.strip()]


def list_branches(repo: Path, workflow_id: str) -> list[str]:
    prefix = namespace_prefix(workflow_id)
    cp = git(repo, "branch", "--list", f"{prefix}*")
    if cp.returncode != 0:
        die(f"git branch --list failed: {cp.stderr.strip() or cp.stdout.strip()}")
    names: list[str] = []
    for line in cp.stdout.splitlines():
        name = line.strip().lstrip("* ").strip()
        if name.startswith("+ "):
            name = name[2:].strip()
        if name:
            names.append(name)
    return names


def parse_worktree_porcelain(text: str) -> list[dict[str, str]]:
    """Parse `git worktree list --porcelain` into dicts with path/branch/head/detached."""
    entries: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.rstrip("\n")
        if not line:
            if current.get("path"):
                entries.append(current)
            current = {}
            continue
        if line.startswith("worktree "):
            if current.get("path"):
                entries.append(current)
            current = {"path": line[len("worktree ") :]}
        elif line.startswith("HEAD "):
            current["head"] = line[len("HEAD ") :]
        elif line.startswith("branch "):
            ref = line[len("branch ") :]
            if ref.startswith("refs/heads/"):
                current["branch"] = ref[len("refs/heads/") :]
            else:
                current["branch"] = ref
        elif line == "detached":
            current["detached"] = "1"
        elif line == "bare":
            current["bare"] = "1"
    if current.get("path"):
        entries.append(current)
    return entries


def worktree_matches(entry: dict[str, str], workflow_id: str, main_path: str) -> bool:
    """True when worktree belongs to uswf/{workflow-id} (branch or path)."""
    path = entry.get("path") or ""
    if path and os.path.normcase(os.path.abspath(path)) == os.path.normcase(
        os.path.abspath(main_path)
    ):
        return False  # never remove the primary checkout
    prefix = namespace_prefix(workflow_id)
    branch = entry.get("branch") or ""
    if branch.startswith(prefix):
        return True
    # Path association: only paths under the uswf/{workflow-id} namespace (AC6).
    # Do not match bare /{workflow_id}/ segments outside uswf/.
    norm = path.replace("\\", "/")
    marker = f"uswf/{workflow_id}"
    if f"/{marker}/" in f"/{norm}/" or norm.endswith(f"/{marker}") or norm.endswith(marker):
        return True
    return False


def list_matching_worktrees(repo: Path, workflow_id: str) -> list[dict[str, str]]:
    cp = git(repo, "worktree", "list", "--porcelain")
    if cp.returncode != 0:
        die(f"git worktree list failed: {cp.stderr.strip() or cp.stdout.strip()}")
    main = str(repo.resolve())
    return [
        e
        for e in parse_worktree_porcelain(cp.stdout)
        if worktree_matches(e, workflow_id, main)
    ]


def worktree_dirty_paths(repo: Path, wt_path: str) -> list[str]:
    cp = git(Path(wt_path), "status", "--porcelain")
    if cp.returncode != 0:
        return [f"(status failed: {cp.stderr.strip() or 'unknown'})"]
    return [line for line in cp.stdout.splitlines() if line.strip()]


def current_branch(repo: Path) -> str | None:
    cp = git(repo, "rev-parse", "--abbrev-ref", "HEAD")
    if cp.returncode != 0:
        return None
    name = cp.stdout.strip()
    return None if name in ("", "HEAD") else name


def branch_checked_out_elsewhere(repo: Path, branch: str) -> bool:
    """True if any worktree (including main) has this branch checked out."""
    cp = git(repo, "worktree", "list", "--porcelain")
    if cp.returncode != 0:
        return True  # be safe
    for entry in parse_worktree_porcelain(cp.stdout):
        if entry.get("branch") == branch:
            return True
    return False


def remove_worktrees(
    repo: Path,
    workflow_id: str,
    *,
    dry_run: bool,
    dirty_policy: str,
) -> None:
    for entry in list_matching_worktrees(repo, workflow_id):
        wt = entry["path"]
        dirty = worktree_dirty_paths(repo, wt)
        if dirty:
            print(f"DIRTY worktree {wt}:")
            for line in dirty:
                print(f"  {line}")
            if dirty_policy == "stop":
                die(
                    f"dirty worktree {wt}; refusing remove (--dirty-policy stop)",
                    code=1,
                )
        if dry_run:
            print(f"[DRY-RUN] git worktree remove --force {wt}")
            continue
        cp = git(repo, "worktree", "remove", "--force", wt)
        if cp.returncode != 0:
            # Broken registration: prune then retry once.
            print(
                f"WARN: worktree remove failed ({cp.stderr.strip() or cp.stdout.strip()}); pruning"
            )
            git(repo, "worktree", "prune")
            cp2 = git(repo, "worktree", "remove", "--force", wt)
            if cp2.returncode != 0:
                die(
                    f"failed to remove worktree {wt}: {cp2.stderr.strip() or cp2.stdout.strip()}"
                )
        else:
            print(f"Removed worktree: {wt}")
    if not dry_run:
        git(repo, "worktree", "prune")


def remove_tags(repo: Path, workflow_id: str, *, dry_run: bool) -> None:
    for tag in list_tags(repo, workflow_id):
        if dry_run:
            print(f"[DRY-RUN] git tag -d {tag}")
            continue
        cp = git(repo, "tag", "-d", tag)
        if cp.returncode != 0:
            die(f"failed to delete tag {tag}: {cp.stderr.strip() or cp.stdout.strip()}")
        print(f"Deleted tag: {tag}")


def remove_branches(repo: Path, workflow_id: str, *, dry_run: bool) -> None:
    head = current_branch(repo)
    for branch in list_branches(repo, workflow_id):
        if is_protected_branch(branch, repo=repo):
            print(f"SKIP branch (protected): {branch}")
            continue
        if head == branch:
            print(f"SKIP branch (checked out on HEAD): {branch}")
            continue
        if branch_checked_out_elsewhere(repo, branch):
            print(f"SKIP branch (checked out in a worktree): {branch}")
            continue
        if dry_run:
            print(f"[DRY-RUN] git branch -D {branch}")
            continue
        cp = git(repo, "branch", "-D", branch)
        if cp.returncode != 0:
            die(
                f"failed to delete branch {branch}: {cp.stderr.strip() or cp.stdout.strip()}"
            )
        print(f"Deleted branch: {branch}")


def verify(repo: Path, workflow_id: str) -> list[str]:
    leftovers: list[str] = []
    for tag in list_tags(repo, workflow_id):
        leftovers.append(f"tag:{tag}")
    for entry in list_matching_worktrees(repo, workflow_id):
        leftovers.append(f"worktree:{entry['path']}")
    for branch in list_branches(repo, workflow_id):
        leftovers.append(f"branch:{branch}")
    return leftovers


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Phase A: remove local uswf/{workflow-id} worktrees, tags, and branches."
    )
    parser.add_argument("--workflow-id", required=True, help="Concluding workflow id")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log intended removals only; zero git mutations",
    )
    parser.add_argument(
        "--repo",
        default=".",
        help="Git repository root (default: cwd)",
    )
    parser.add_argument(
        "--dirty-policy",
        choices=("force", "stop"),
        default="force",
        help="On dirty worktree: force-remove after log (default) or exit 1 without half-register",
    )
    args = parser.parse_args(argv)

    workflow_id = validate_workflow_id(args.workflow_id)
    repo = Path(args.repo).resolve()
    if not (repo / ".git").exists() and not (repo / ".git").is_file():
        # Allow worktree checkouts where .git is a file
        cp = git(repo, "rev-parse", "--is-inside-work-tree")
        if cp.returncode != 0 or cp.stdout.strip() != "true":
            die(f"not a git repository: {repo}")

    print(f"cleanup_workflow_git: workflow-id={workflow_id} repo={repo}")
    if args.dry_run:
        print("[DRY-RUN] no git mutations will be performed")

    # Order: worktrees → tags → branches
    remove_worktrees(
        repo, workflow_id, dry_run=args.dry_run, dirty_policy=args.dirty_policy
    )
    remove_tags(repo, workflow_id, dry_run=args.dry_run)
    remove_branches(repo, workflow_id, dry_run=args.dry_run)

    if args.dry_run:
        print("CLEAN (dry-run)")
        return 0

    leftovers = verify(repo, workflow_id)
    if leftovers:
        joined = ", ".join(leftovers)
        print(f"WARN: leftover: {joined}")
        return 2
    print("CLEAN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
