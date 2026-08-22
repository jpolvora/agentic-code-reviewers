#!/usr/bin/env python3
"""
Detect / configure plans.specsDir for ws-local-spec-provider.

Usage:
  python detect_specs_dir.py --detect [--ensure] [--json]
  python detect_specs_dir.py --configure <relative-or-absolute-dir> [--json]
  python detect_specs_dir.py --validate [--json]

Defaults: plans.specsDir = ".agents/specs" (under .agents/).
If repo-root "specs/" already exists and config omits specsDir, prefer "specs" (legacy).
Never commits config.json (gitignored in consumers).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
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
from resolve_consumer_root import resolve_repo_root  # noqa: E402


def _repo_root(override: str | None = None) -> Path:
    return resolve_repo_root(override, script_file=__file__)


REPO_ROOT = _repo_root()
CONFIG_PATH = REPO_ROOT / ".agents" / "skills" / "ws-shared" / "config.json"
DEFAULT_SPECS_DIR = ".agents/specs"
LEGACY_SPECS_DIR = "specs"


def default_specs_dir_rel() -> str:
    """Prefer existing repo-root specs/; otherwise default under .agents/specs."""
    if (REPO_ROOT / LEGACY_SPECS_DIR).is_dir():
        return LEGACY_SPECS_DIR
    return DEFAULT_SPECS_DIR


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise SystemExit(f"ERROR: cannot parse {CONFIG_PATH}: {exc}") from exc


def save_config(data: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def resolve_specs_dir(cfg: dict | None = None) -> Path:
    """Return absolute specsDir from config or portable default under .agents/."""
    cfg = cfg if cfg is not None else load_config()
    rel = ((cfg.get("plans") or {}).get("specsDir") or default_specs_dir_rel()).strip()
    path = Path(rel)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


def ensure_specs_dir(create_config: bool = True) -> tuple[Path, bool, bool]:
    """
    Ensure specsDir exists. Optionally write plans.specsDir into config.json.

    Returns (path, created_dir, wrote_config).
    """
    cfg = load_config()
    plans = cfg.setdefault("plans", {})
    wrote_config = False

    if not plans.get("specsDir"):
        plans["specsDir"] = default_specs_dir_rel()
        if create_config:
            if not CONFIG_PATH.exists():
                # Minimal stub so detect/configure still works without full bootstrap.
                cfg.setdefault("$schema", "./config.schema.json")
            save_config(cfg)
            wrote_config = True

    specs = resolve_specs_dir(cfg)
    created_dir = False
    if not specs.exists():
        specs.mkdir(parents=True, exist_ok=True)
        created_dir = True
    elif not specs.is_dir():
        raise SystemExit(f"ERROR: specsDir exists but is not a directory: {specs}")

    return specs, created_dir, wrote_config


def configure(specs_dir: str) -> Path:
    """Set plans.specsDir and create the directory."""
    path = Path(specs_dir)
    if not path.is_absolute():
        path = (REPO_ROOT / path).resolve()
    else:
        path = path.resolve()

    try:
        rel = path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        rel = str(path)

    path.mkdir(parents=True, exist_ok=True)

    cfg = load_config()
    plans = cfg.setdefault("plans", {})
    plans["specsDir"] = rel
    save_config(cfg)
    return path


def validate() -> dict:
    """validate-auth for local: specsDir exists/creatable; config writable when present."""
    result = {
        "ok": True,
        "checks": [],
        "specsDir": None,
        "configPath": str(CONFIG_PATH),
    }
    try:
        specs, created, wrote = ensure_specs_dir(create_config=True)
        result["specsDir"] = str(specs)
        result["checks"].append(
            {
                "name": "specsDir",
                "pass": True,
                "detail": f"exists at {specs}"
                + (" (created)" if created else "")
                + (" (config updated)" if wrote else ""),
            }
        )
    except SystemExit as exc:
        result["ok"] = False
        result["checks"].append({"name": "specsDir", "pass": False, "detail": str(exc)})
        return result

    if CONFIG_PATH.exists():
        writable = CONFIG_PATH.is_file() and os_access_write(CONFIG_PATH)
        result["checks"].append(
            {
                "name": "configWritable",
                "pass": writable,
                "detail": str(CONFIG_PATH),
            }
        )
        if not writable:
            result["ok"] = False
    else:
        result["checks"].append(
            {
                "name": "configWritable",
                "pass": True,
                "detail": "config.json absent; detect --ensure can create plans.specsDir on write",
            }
        )

    return result


def os_access_write(path: Path) -> bool:
    try:
        with path.open("a", encoding="utf-8"):
            return True
    except OSError:
        return False


def emit(payload: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        for key, val in payload.items():
            if key == "checks":
                for c in val or []:
                    mark = "PASS" if c.get("pass") else "FAIL"
                    print(f"  [{mark}] {c.get('name')}: {c.get('detail')}")
            else:
                print(f"{key}: {val}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Detect/configure local specsDir (plans.specsDir, default .agents/specs)."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--detect",
        action="store_true",
        help="Print resolved specsDir (from config or default .agents/specs).",
    )
    group.add_argument(
        "--configure",
        metavar="DIR",
        help="Set plans.specsDir to DIR (relative to repo root preferred) and create it.",
    )
    group.add_argument(
        "--validate",
        action="store_true",
        help="validate-auth: specsDir exists/creatable; config writable when configuring.",
    )
    parser.add_argument(
        "--ensure",
        action="store_true",
        help="With --detect: create missing specsDir and write default plans.specsDir.",
    )
    parser.add_argument("--json", action="store_true", help="Machine-readable JSON output.")
    parser.add_argument(
        "--repo-root",
        type=str,
        default=None,
        help="Consumer project root (default: cwd hub probe)",
    )
    args = parser.parse_args()

    ensure_utf8_stdio()

    global REPO_ROOT, CONFIG_PATH
    REPO_ROOT = _repo_root(args.repo_root)
    CONFIG_PATH = REPO_ROOT / ".agents" / "skills" / "ws-shared" / "config.json"

    if args.detect:
        if args.ensure:
            path, created, wrote = ensure_specs_dir(create_config=True)
            emit(
                {
                    "specsDir": str(path),
                    "relative": path.relative_to(REPO_ROOT).as_posix()
                    if path.is_relative_to(REPO_ROOT)
                    else str(path),
                    "createdDir": created,
                    "wroteConfig": wrote,
                    "configPath": str(CONFIG_PATH),
                },
                args.json,
            )
        else:
            path = resolve_specs_dir()
            emit(
                {
                    "specsDir": str(path),
                    "exists": path.is_dir(),
                    "relative": (
                        path.relative_to(REPO_ROOT).as_posix()
                        if path.is_relative_to(REPO_ROOT)
                        else str(path)
                    ),
                    "configPath": str(CONFIG_PATH),
                },
                args.json,
            )
        return 0

    if args.configure:
        path = configure(args.configure)
        emit(
            {
                "specsDir": str(path),
                "relative": path.relative_to(REPO_ROOT).as_posix()
                if path.is_relative_to(REPO_ROOT)
                else str(path),
                "configPath": str(CONFIG_PATH),
                "action": "configured",
            },
            args.json,
        )
        return 0

    # --validate
    result = validate()
    emit(result, args.json)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
