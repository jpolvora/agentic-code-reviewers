#!/usr/bin/env python3
"""
Regression sabotage helper: invert fix, expect test failure, restore bytes.

Usage:
  python run_sabotage.py --test "npm run test-x" --paths file.js --invert-patch invert.patch

Restore failure → git restore --source=HEAD -- <paths>; exit 1.
Restore success is proven against the pre-invert snapshot only (not HEAD-clean).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

_SHARED_SCRIPTS = Path(__file__).resolve().parents[2] / "ws-shared" / "scripts"
if str(_SHARED_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SHARED_SCRIPTS))
from resolve_consumer_root import (  # noqa: E402
    load_config,
    resolve_repo_root,
    to_repo_relative,
)


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


def apply_patch(repo_root: Path, patch_file: Path) -> None:
    proc = subprocess.run(
        ["git", "apply", "--ignore-whitespace", "--whitespace=nowarn", str(patch_file)],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or "git apply failed")


def is_tracked(repo_root: Path, rel_path: str) -> bool:
    proc = subprocess.run(
        ["git", "ls-files", "--error-unmatch", rel_path],
        cwd=repo_root,
        capture_output=True,
    )
    return proc.returncode == 0


def snapshot_restored(abs_paths: list[Path], snapshots: dict[Path, bytes]) -> bool:
    for p in abs_paths:
        if p.read_bytes() != snapshots[p]:
            return False
    return True


def configured_test_aliases(repo_root: Path) -> dict[str, str]:
    verification = (load_config(repo_root).get("verification") or {})
    return {
        name: value
        for name, value in verification.items()
        if name.endswith("Test") and isinstance(value, str) and value.strip()
    }


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=True, sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run regression sabotage (invert, test bites, restore)")
    parser.add_argument("--test", required=True, help="Test command (shell)")
    parser.add_argument("--paths", nargs="+", required=True, help="Product files to invert")
    parser.add_argument("--invert-patch", required=True, help="Caller-authored invert patch file")
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--simulate-restore-failure", action="store_true", help="Test hook only")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root, script_file=__file__)
    abs_paths = [(repo_root / p).resolve() for p in args.paths]
    rel_paths: list[str] = []
    for p in abs_paths:
        try:
            rel_paths.append(to_repo_relative(repo_root, p))
        except ValueError:
            emit({"status": "failed", "reason": "path-outside-repository", "path": str(p)})
            return 1

    aliases = configured_test_aliases(repo_root)
    matching_alias = next((name for name, command in aliases.items() if command == args.test), None)
    if matching_alias is None:
        emit({
            "status": "failed",
            "reason": "test-command-not-configured-alias",
            "configuredAliases": sorted(aliases),
        })
        return 1

    snapshots: dict[Path, bytes] = {}
    for p, relative in zip(abs_paths, rel_paths):
        if not p.is_file():
            emit({"status": "failed", "reason": "missing-path", "path": relative})
            return 1
        if not is_tracked(repo_root, relative):
            emit({"status": "failed", "reason": "path-not-tracked", "path": relative})
            return 1
        snapshots[p] = p.read_bytes()

    patch_file = Path(args.invert_patch).resolve()
    if not patch_file.is_file():
        emit({"status": "failed", "reason": "missing-invert-patch"})
        return 1

    exit_code = 0
    reason = "test-failed-as-expected"
    test_exit_code = None
    try:
        apply_patch(repo_root, patch_file)
        unchanged = [
            relative
            for p, relative in zip(abs_paths, rel_paths)
            if p.read_bytes() == snapshots[p]
        ]
        if unchanged:
            reason = "invert-did-not-change-every-path"
            exit_code = 1
            return exit_code
        proc = subprocess.run(
            args.test,
            shell=True,
            cwd=repo_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        test_exit_code = proc.returncode
        if proc.returncode == 0:
            reason = "test-passed-with-inverted-code"
            exit_code = 1
    except RuntimeError as exc:
        reason = f"invert-apply-failed: {exc}"
        exit_code = 1
    finally:
        for p, content in snapshots.items():
            p.write_bytes(content)
        if args.simulate_restore_failure:
            abs_paths[0].write_bytes(b"CORRUPT")
        restored = snapshot_restored(abs_paths, snapshots)
        if not restored:
            for p, content in snapshots.items():
                p.write_bytes(content)
            reason = "restore-failure-simulated" if args.simulate_restore_failure else "restore-byte-mismatch"
            exit_code = 1
        emit({
            "status": "passed" if exit_code == 0 else "failed",
            "reason": reason,
            "testAlias": matching_alias,
            "testExitCode": test_exit_code,
            "paths": rel_paths,
            "restored": snapshot_restored(abs_paths, snapshots),
        })

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
