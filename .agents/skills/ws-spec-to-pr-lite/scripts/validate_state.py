#!/usr/bin/env python3
"""
validate_state -- State Hygiene assertions for a ws-spec-to-pr-lite state.md (v7).

Usage:
    python validate_state.py <workflow-id-or-state-path>
    python validate_state.py <...> --json
    python validate_state.py <...> --pre-advance <N>

Validates a workflow `state.md` against the v7 State Hygiene Protocol:
  - YAML frontmatter is parseable and has the required keys.
  - Every file in `workflowManifest.created` / `artifacts` exists on disk
    (skipped when `dryRun: true`).
  - `currentStep` is coherent with `completedSteps`.
  - Commits recorded in `commits[]` exist in git (best-effort).

With `--pre-advance <N>` (before dispatch to lite step N, N=1..5):
  - Checkpoint tag `uswf/{workflow-id}/before-step-{N}` exists and is reachable.
  - Required input artifacts for advance-to-N exist (ARTIFACTS.md; lite mirrors 1–5).
  - `completedSteps` is strictly increasing with no gaps except `skippedSteps`.

Exit codes:
  0  state coherent (warnings allowed)
  1  incoherent (missing files, bad currentStep, unparseable state)
"""

import json
import os
import re
import subprocess
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


AGENT_ROOT = Path(__file__).resolve().parent.parent          # .../ws-spec-to-pr-lite
REPO_ROOT = resolve_repo_root(script_file=__file__)
PLANS_DIR = None

LITE_ADVANCE_MIN = 1
LITE_ADVANCE_MAX = 5


def load_plans_dir() -> Path:
    """Resolve plans.dir from ws-shared config.json (default .agents/plans)."""
    cfg = REPO_ROOT / ".agents" / "skills" / "ws-shared" / "config.json"
    plans = Path(".agents") / "plans"
    if cfg.exists():
        try:
            import json as _json
            data = _json.loads(cfg.read_text(encoding="utf-8"))
            rel = (data.get("plans") or {}).get("dir") or ".agents/plans"
            plans = Path(rel)
        except Exception:
            pass
    return (REPO_ROOT / plans).resolve() if not plans.is_absolute() else plans.resolve()


REQUIRED_KEYS = ["workflowId", "us", "status", "currentStep"]
PHASE_SOFT_TIP_STEPS = set()  # No phase soft-tip steps in ws-spec-to-pr-lite

# Current state schema version. update_state.py always stamps this value
# (clamps unknown highs so post-write validation can succeed). On-disk
# state that is missing, older, or unknown is rejected loudly (no compat
# shims) until a writer rewrite. Keep in sync with CURRENT_STATE_VERSION
# in the standard ws-spec-to-pr/scripts/validate_state.py and both
# _STATE_VERSION stamps below.
CURRENT_STATE_VERSION = 1


def verify_state_version(data: dict, errors: list[str]) -> None:
    """Reject a missing/older/unknown stateVersion with a clear message."""
    raw = data.get("stateVersion")
    try:
        version = int(str(raw).strip()) if raw is not None else None
    except (TypeError, ValueError):
        version = None
    if version is None:
        errors.append(
            "stateVersion missing or non-integer in frontmatter; "
            "state format is not versioned / unsupported (reject loud, no compat shims)"
        )
    elif version < CURRENT_STATE_VERSION:
        errors.append(
            f"stateVersion {version} is older than the supported schema "
            f"{CURRENT_STATE_VERSION}; state format not supported (reject loud, no compat shims)"
        )
    elif version > CURRENT_STATE_VERSION:
        errors.append(
            f"stateVersion {version} is unknown/unrecognized (expected "
            f"{CURRENT_STATE_VERSION}); state format not supported (reject loud, no compat shims)"
        )


def resolve_state_path(arg: str) -> Path:
    p = Path(arg)
    if p.exists():
        return p
    names = [arg, f"{arg}.state.md"] if not arg.endswith(".state.md") else [arg]
    plans_dir = load_plans_dir()
    if plans_dir.exists():
        for name in names:
            matches = sorted(plans_dir.glob(f"**/{name}"))
            if matches:
                return matches[0]
    return p


def extract_frontmatter(text: str) -> str:
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        raise ValueError("frontmatter YAML (--- ... ---) not found")
    return m.group(1)


def _strip(val: str) -> str:
    return val.strip().strip('"').strip("'").strip()


def parse_frontmatter(fm: str) -> dict:
    data: dict = {}
    lines = fm.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()
        i += 1
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()

        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            data[key] = [_strip(x) for x in inner.split(",") if x.strip()] if inner else []
            continue

        if val == "" or val == "|":
            block = []
            while i < len(lines) and (lines[i].startswith(("  ", "\t")) or not lines[i].strip()):
                block.append(lines[i])
                i += 1
            data[key] = _parse_block(block) if block else val
            continue

        data[key] = _strip(val)
    return data


def _parse_block(block: list) -> dict | list:
    items = []
    nested: dict = {}
    j = 0
    while j < len(block):
        ln = block[j]
        s = ln.strip()
        j += 1
        if not s:
            continue
        lm = re.match(r"^-\s*(.*)$", s)
        if lm:
            item = lm.group(1).strip()
            pm = re.match(r"^path:\s*(.*)$", item)
            items.append(_strip(pm.group(1)) if pm else _strip(item))
            continue
        km = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", s)
        if km:
            ckey, cval = km.group(1), km.group(2).strip()
            if cval.startswith("[") and cval.endswith("]"):
                inner = cval[1:-1].strip()
                nested[ckey] = [_strip(x) for x in inner.split(",") if x.strip()] if inner else []
            elif cval == "":
                sub = []
                while j < len(block) and (block[j].startswith("    ") or not block[j].strip()):
                    sub.append(block[j].strip())
                    j += 1
                nested[ckey] = [
                    _strip(re.sub(r"^-\s*", "", x)) for x in sub if x and not x.endswith(":")
                ]
            else:
                nested[ckey] = _strip(cval)
    if items and not nested:
        return items
    return nested


def _as_int_list(val) -> list:
    out = []
    if isinstance(val, list):
        for v in val:
            try:
                out.append(int(str(v).strip()))
            except ValueError:
                pass
    return out


def resolve_slug(data: dict, state_path: Path) -> str:
    for key in ("slug", "us"):
        val = data.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if text and text.lower() not in ("null", "none"):
            return text
    return state_path.parent.name


def resolve_us_dir(slug: str) -> Path:
    return load_plans_dir() / slug


def _rel_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(REPO_ROOT.resolve()))
    except ValueError:
        return str(path)


def _require_exists(path: Path, label: str, errors: list[str]) -> bool:
    if not path.exists():
        errors.append(f"pre-advance artifact missing: {label} ({_rel_path(path)})")
        return False
    return True


def _skipped_step_numbers(data: dict, fm_raw: str) -> set[int]:
    out: set[int] = set()
    raw = data.get("skippedSteps")
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict) and "step" in item:
                try:
                    out.add(int(str(item["step"]).strip()))
                except (TypeError, ValueError):
                    pass
            elif isinstance(item, str):
                m = re.search(r"step:\s*(\d+)", item)
                if m:
                    out.add(int(m.group(1)))
    sec = re.search(
        r"^skippedSteps:\s*\n(.*?)(?=^[A-Za-z0-9_]+:|\Z)",
        fm_raw,
        re.MULTILINE | re.DOTALL,
    )
    if sec:
        for m in re.finditer(r"step:\s*(\d+)", sec.group(1)):
            out.add(int(m.group(1)))
    return out


def verify_checkpoint_tag(
    workflow_id: str,
    step_n: int,
    errors: list[str],
    warnings: list[str] | None = None,
    *,
    dry_run: bool = False,
) -> None:
    """Require checkpoint tag; soft-pass (warning only) when dry_run is True."""
    tag = f"uswf/{workflow_id}/before-step-{step_n}"
    sink = warnings if dry_run and warnings is not None else errors
    suffix = " (soft-pass: dryRun)" if dry_run and warnings is not None else ""

    try:
        listed = subprocess.run(
            ["git", "tag", "-l", tag],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if listed.returncode != 0 or not listed.stdout.strip():
            sink.append(f"pre-advance checkpoint tag missing: {tag}{suffix}")
            return
        verified = subprocess.run(
            ["git", "rev-parse", "--verify", f"{tag}^{{commit}}"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if verified.returncode != 0:
            sink.append(f"pre-advance checkpoint tag not reachable: {tag}{suffix}")
    except (OSError, FileNotFoundError):
        sink.append(f"pre-advance git unavailable for checkpoint tag: {tag}{suffix}")


def verify_monotonicity(
    completed: list[int], skipped: set[int], errors: list[str]
) -> None:
    if not completed:
        return
    seen: set[int] = set()
    duplicates: list[int] = []
    for step in completed:
        if step in seen:
            duplicates.append(step)
        seen.add(step)
    if duplicates:
        errors.append(
            "pre-advance duplicate completedSteps entries: "
            f"{sorted(set(duplicates))}"
        )
    unique = sorted(seen)
    lo, hi = unique[0], unique[-1]
    for step in range(lo, hi + 1):
        if step not in seen and step not in skipped:
            errors.append(
                f"pre-advance gap in completedSteps: step {step} missing "
                "(not listed in skippedSteps)"
            )


def verify_step_artifacts_lite(
    slug: str,
    advance_to: int,
    us_dir: Path,
    data: dict,
    dry_run: bool,
    errors: list[str],
) -> None:
    """ARTIFACTS.md step input prerequisites for lite steps 1–5 (mirrors standard 1–5)."""
    spec = us_dir / f"step-00-{slug}.spec.md"
    plan = us_dir / f"step-01-{slug}.plan.md"
    refined = us_dir / f"step-02-{slug}.plan.refined.md"
    plan_or_refined = refined if refined.exists() else plan

    if advance_to == 1:
        _require_exists(spec, f"step-00-{slug}.spec.md", errors)
        return

    if advance_to == 2:
        _require_exists(spec, f"step-00-{slug}.spec.md", errors)
        _require_exists(plan, f"step-01-{slug}.plan.md", errors)
        return

    if advance_to == 3:
        _require_exists(spec, f"step-00-{slug}.spec.md", errors)
        if refined.exists():
            _require_exists(refined, f"step-02-{slug}.plan.refined.md", errors)
        else:
            _require_exists(plan, f"step-01-{slug}.plan.md", errors)
        return

    if advance_to == 4:
        label = (
            f"step-02-{slug}.plan.refined.md"
            if refined.exists()
            else f"step-01-{slug}.plan.md"
        )
        _require_exists(plan_or_refined, label, errors)
        return

    if advance_to == 5:
        label = (
            f"step-02-{slug}.plan.refined.md"
            if refined.exists()
            else f"step-01-{slug}.plan.md"
        )
        _require_exists(plan_or_refined, label, errors)
        if dry_run:
            return
        manifest = data.get("workflowManifest", {})
        created = manifest.get("created", []) if isinstance(manifest, dict) else []
        artifacts = manifest.get("artifacts", []) if isinstance(manifest, dict) else []
        paths = [
            p
            for p in list(created) + list(artifacts)
            if p and str(p).strip() not in ("[]", "|")
        ]
        if not paths:
            errors.append(
                "pre-advance implementation tree required "
                "(workflowManifest created/artifacts non-empty or dryRun)"
            )


def run_pre_advance_checks(
    state_path: Path,
    data: dict,
    fm_raw: str,
    advance_to: int,
    dry_run: bool,
    completed: list[int],
    errors: list[str],
    warnings: list[str] | None = None,
) -> None:
    if advance_to < LITE_ADVANCE_MIN or advance_to > LITE_ADVANCE_MAX:
        errors.append(
            f"pre-advance step out of lite range "
            f"({LITE_ADVANCE_MIN}..{LITE_ADVANCE_MAX}): {advance_to}"
        )
        return

    workflow_id = str(data.get("workflowId", "")).strip()
    if not workflow_id:
        errors.append("pre-advance workflowId missing in state frontmatter")
        return

    slug = resolve_slug(data, state_path)
    us_dir = resolve_us_dir(slug)

    verify_checkpoint_tag(
        workflow_id, advance_to, errors, warnings, dry_run=dry_run
    )
    verify_step_artifacts_lite(slug, advance_to, us_dir, data, dry_run, errors)
    verify_monotonicity(completed, _skipped_step_numbers(data, fm_raw), errors)


def git_commit_exists(sha: str) -> bool:
    try:
        r = subprocess.run(
            ["git", "cat-file", "-e", f"{sha}^{{commit}}"],
            cwd=str(REPO_ROOT),
            capture_output=True,
        )
        return r.returncode == 0
    except (OSError, FileNotFoundError):
        return True


def validate(state_path: Path, pre_advance: int | None = None) -> dict:
    errors: list[str] = []
    warnings: list[str] = []

    text = state_path.read_text(encoding="utf-8")
    fm = extract_frontmatter(text)
    data = parse_frontmatter(fm)
    fm_raw = fm

    for k in REQUIRED_KEYS:
        if k not in data:
            errors.append(f"mandatory key missing in frontmatter: {k}")

    # Enforced in the shared validate() body covered by both the plain and
    # pre-advance validation paths (lite dispatches pre-advance through here).
    verify_state_version(data, errors)

    dry_run = str(data.get("dryRun", "false")).lower() == "true"
    status = str(data.get("status", "")).strip().lower()
    closed = status in ("completed", "cancelled", "failed")
    completed = _as_int_list(data.get("completedSteps", []))

    cur_raw = data.get("currentStep")
    try:
        current = int(str(cur_raw).strip())
    except (TypeError, ValueError):
        current = None
        errors.append(f"currentStep is non-numeric: {cur_raw!r}")

    if current is not None and completed:
        mx = max(completed)
        if current not in (mx + 1, mx) and current not in completed:
            errors.append(
                f"currentStep={current} inconsistent with completedSteps "
                f"(expected {mx} or {mx + 1})"
            )

    manifest = data.get("workflowManifest", {})
    created = manifest.get("created", []) if isinstance(manifest, dict) else []
    artifacts = manifest.get("artifacts", []) if isinstance(manifest, dict) else []
    checked = 0
    if not dry_run:
        seen = set()
        for path in list(created) + list(artifacts):
            if not path or path in ("[]", "|") or path in seen:
                continue
            seen.add(path)
            checked += 1
            target = (REPO_ROOT / path).resolve()
            if not target.exists():
                msg = f"manifest file missing on disk: {path}"
                (warnings if closed else errors).append(msg)

    # Match block (`- sha: abc`) and inline-dict (`- { sha: "abc", ... }`) forms.
    commit_shas = []
    for m in re.finditer(r"\bsha:\s*['\"]?([0-9a-f]{7,40})", fm_raw):
        if m.group(1) not in commit_shas:
            commit_shas.append(m.group(1))
    if not dry_run:
        for sha in commit_shas:
            if not git_commit_exists(sha):
                errors.append(f"registered commit does not exist in git: {sha}")

    if pre_advance is not None:
        run_pre_advance_checks(
            state_path,
            data,
            fm_raw,
            pre_advance,
            dry_run,
            completed,
            errors,
            warnings,
        )

    return {
        "state": str(state_path),
        "workflowId": data.get("workflowId"),
        "status": data.get("status"),
        "currentStep": current,
        "dryRun": dry_run,
        "completedSteps": completed,
        "preAdvance": pre_advance,
        "files_checked": checked,
        "commits_checked": commit_shas,
        "errors": errors,
        "warnings": warnings,
        "ok": not errors,
    }


def _parse_cli(argv: list[str]) -> tuple[list[str], bool, int | None]:
    as_json = False
    pre_advance: int | None = None
    positional: list[str] = []
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--json":
            as_json = True
            i += 1
            continue
        if arg == "--pre-advance":
            if i + 1 >= len(argv):
                print("Error: --pre-advance requires a step number", file=sys.stderr)
                sys.exit(1)
            try:
                pre_advance = int(argv[i + 1])
            except ValueError:
                print(
                    f"Error: --pre-advance step must be an integer, got {argv[i + 1]!r}",
                    file=sys.stderr,
                )
                sys.exit(1)
            i += 2
            continue
        if arg.startswith("--"):
            print(f"Error: unknown flag: {arg}", file=sys.stderr)
            sys.exit(1)
        positional.append(arg)
        i += 1
    return positional, as_json, pre_advance


def main():
    ensure_utf8_stdio()

    positional, as_json, pre_advance = _parse_cli(sys.argv[1:])
    if len(positional) < 1:
        print(
            "Usage: python validate_state.py <workflow-id-or-state-path> "
            "[--json] [--pre-advance <N>]",
            file=sys.stderr,
        )
        sys.exit(1)

    state_path = resolve_state_path(positional[0])
    if not state_path.exists():
        print(f"Error: state.md not found: {positional[0]}", file=sys.stderr)
        sys.exit(1)

    try:
        result = validate(state_path, pre_advance=pre_advance)
    except (ValueError, OSError) as exc:
        print(f"Error validating {state_path}: {exc}", file=sys.stderr)
        sys.exit(1)

    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        title = "validate_state (lite) -- State Hygiene (v7)"
        if pre_advance is not None:
            title += f" [pre-advance {pre_advance}]"
        print("=" * 50)
        print(f"  {title}")
        print("=" * 50)
        print(f"State: {result['state']}")
        print(f"Workflow: {result['workflowId']} | status: {result['status']} "
              f"| currentStep: {result['currentStep']} | dryRun: {result['dryRun']}")
        print(f"completedSteps: {result['completedSteps']}")
        print(f"Files verified: {result['files_checked']} | "
              f"commits: {len(result['commits_checked'])}")
        if result["warnings"]:
            print("\n## Warnings")
            for w in result["warnings"]:
                print(f"  ! {w}")
        if result["errors"]:
            print("\n## ERRORS")
            for e in result["errors"]:
                print(f"  x {e}")
        else:
            print("\n[OK] state is consistent with manifest and git.")

    if not result["ok"]:
        for err in result["errors"]:
            print(err, file=sys.stderr)

    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
