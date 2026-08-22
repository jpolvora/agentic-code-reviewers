#!/usr/bin/env python3
"""
validate_state -- State Hygiene assertions for a ws-spec-to-pr state.md (v7).

Usage:
    python validate_state.py <workflow-id-or-state-path>
    python validate_state.py <...> --json
    python validate_state.py <...> --pre-advance <N>

Validates a workflow `state.md` against the v7 State Hygiene Protocol:
  - YAML frontmatter is parseable and has the required keys.
  - Every file in `workflowManifest.created` / `artifacts` exists on disk
    (skipped when `dryRun: true`). Paths ending in `/` are checked as dirs.
  - `currentStep` is coherent with `completedSteps` (next gate = max+1, or a
    repeated step already in the set).
  - `completedSteps` must NOT contain the phase soft-tip steps 4/8 (they are
    never board steps in v7) -> ERROR.
  - Commits recorded in `commits[]` exist in git (best-effort; skipped if git
    is unavailable or `dryRun: true`).

With `--pre-advance <N>` (before dispatch to step N):
  - Checkpoint tag `uswf/{workflow-id}/before-step-{N}` exists and is reachable
    (soft-pass / warning only when `dryRun: true`; tags are not written in dry-run).
  - Required input artifacts for advance-to-N exist (ARTIFACTS.md step table).
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


AGENT_ROOT = Path(__file__).resolve().parent.parent          # .../ws-spec-to-pr
REPO_ROOT = resolve_repo_root(script_file=__file__)
PLANS_DIR = None  # resolved lazily via load_plans_dir()

def load_plans_dir() -> Path:
    """Resolve plans.dir from shared config.json (default .agents/plans)."""
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

# Current state schema version. update_state.py always stamps this value
# (clamps unknown highs so post-write validation can succeed). On-disk
# state that is missing, older, or unknown is rejected loudly (no compat
# shims) until a writer rewrite. Keep in sync with CURRENT_STATE_VERSION
# in the lite validate_state.py and both _STATE_VERSION stamps below.
CURRENT_STATE_VERSION = 1


def verify_state_version(data: dict, errors: list[str]) -> None:
    """Reject a missing/older/unknown stateVersion with a clear message (AC4)."""
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
    # State files live under {plansDir}/us-{id}/{workflow-id}.state.md.
    # Accept either a full/relative path, a bare workflow-id, or {id}.state.md
    # and search recursively under the plans dir.
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
    """Minimal YAML reader for the flat keys + the few nested blocks we need.

    Avoids a PyYAML dependency to keep the skill self-contained.
    """
    data: dict = {}
    lines = fm.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()
        i += 1
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        # top-level key (no indent)
        m = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()

        # inline list: [a, b, c]
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            data[key] = [_strip(x) for x in inner.split(",") if x.strip()] if inner else []
            continue

        if val == "" or val == "|":
            # could be a nested block (indented children). Collect indented lines.
            block = []
            while i < len(lines) and (lines[i].startswith(("  ", "\t")) or not lines[i].strip()):
                block.append(lines[i])
                i += 1
            data[key] = _parse_block(block) if block else val
            continue

        data[key] = _strip(val)
    return data


def _parse_block(block: list) -> dict | list:
    """Parse an indented YAML block into nested dict / list of paths."""
    # list of "- item" lines
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
            # "- path: x" style records -> keep the value after "path:"
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


def git_commit_exists(sha: str) -> bool:
    try:
        r = subprocess.run(
            ["git", "cat-file", "-e", f"{sha}^{{commit}}"],
            cwd=str(REPO_ROOT),
            capture_output=True,
        )
        return r.returncode == 0
    except (OSError, FileNotFoundError):
        return True  # git unavailable -> do not fail


def _parse_skipped_steps(data: dict, fm_raw: str = "") -> set[int]:
    """Return step numbers recorded in skippedSteps (and skipTesting → step 7)."""
    skipped: set[int] = set()
    raw = data.get("skippedSteps", [])
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                step_val = item.get("step")
                try:
                    skipped.add(int(str(step_val).strip()))
                except (TypeError, ValueError, AttributeError):
                    pass
            else:
                try:
                    skipped.add(int(str(item).strip()))
                except ValueError:
                    pass
    elif isinstance(raw, (int, str)):
        try:
            skipped.add(int(str(raw).strip()))
        except ValueError:
            pass

    if fm_raw:
        block_match = re.search(
            r"^skippedSteps:\s*\n((?:[ \t].*\n?)*)",
            fm_raw,
            re.MULTILINE,
        )
        if block_match:
            block = block_match.group(1)
            for m in re.finditer(r"step:\s*(\d+)", block):
                skipped.add(int(m.group(1)))
            for m in re.finditer(r"^-\s*(\d+)\s*$", block, re.MULTILINE):
                skipped.add(int(m.group(1)))

    if str(data.get("skipTesting", "false")).lower() == "true":
        skipped.add(7)
    return skipped


def _us_dir(slug: str, state_path: Path) -> Path:
    """Resolve {us-dir} — parent of state.md when it matches slug layout."""
    if state_path.parent.name == slug:
        return state_path.parent
    return load_plans_dir() / slug


def verify_checkpoint_tag(
    workflow_id: str, step_n: int, *, dry_run: bool = False
) -> tuple[list[str], list[str]]:
    """`git tag -l uswf/{workflow-id}/before-step-{N}` must exist and be reachable.

    When ``dry_run`` is True, missing/unreachable tags are warnings only (soft-pass),
    matching checkpoint creation which skips tag writes in dry-run.
    """
    errors: list[str] = []
    warnings: list[str] = []
    tag = f"uswf/{workflow_id}/before-step-{step_n}"

    def _fail(msg: str) -> tuple[list[str], list[str]]:
        if dry_run:
            warnings.append(f"{msg} (soft-pass: dryRun)")
        else:
            errors.append(msg)
        return errors, warnings

    try:
        listed = subprocess.run(
            ["git", "tag", "-l", tag],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        if listed.returncode != 0:
            return _fail(
                f"checkpoint tag lookup failed for {tag!r} (git tag -l exit {listed.returncode})"
            )
        matches = [line.strip() for line in listed.stdout.splitlines() if line.strip()]
        if not matches:
            return _fail(
                f"checkpoint tag missing: {tag} "
                f"(create before advance to step {step_n})"
            )
        resolved = subprocess.run(
            ["git", "rev-parse", "--verify", f"{tag}^{{commit}}"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        if resolved.returncode != 0:
            return _fail(
                f"checkpoint tag {tag} does not point to a reachable commit"
            )
    except (OSError, FileNotFoundError):
        return _fail(f"git unavailable; cannot verify checkpoint tag {tag}")
    return errors, warnings


def _artifact_exists(us_dir: Path, name: str) -> bool:
    return (us_dir / name).is_file()


def _verify_pr_ship_evidence(data: dict, slug: str, us_dir: Path) -> list[str]:
    """Step 9 prerequisite: PR exists (ship evidence)."""
    for key in ("prUrl", "prNumber", "pullRequest", "pr"):
        val = data.get(key)
        if val is not None and str(val).strip().lower() not in ("", "null", "none", "false"):
            return []

    result_path = us_dir / f"step-08-{slug}.result.md"
    if result_path.is_file():
        body = result_path.read_text(encoding="utf-8", errors="replace")
        if re.search(r"github\.com/[^/\s]+/[^/\s]+/pull/\d+", body, re.I):
            return []
        if re.search(r"\bPR\s*#?\d+\b", body, re.I):
            return []

    branch = data.get("branch")
    if branch:
        try:
            viewed = subprocess.run(
                ["gh", "pr", "view", str(branch).strip(), "--json", "url"],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
            )
            if viewed.returncode == 0 and viewed.stdout.strip():
                return []
        except (OSError, FileNotFoundError):
            pass

    return [
        "advance to step 9 requires ship evidence (PR url/number in state, "
        "step-08 result, or an open PR for workflow branch)"
    ]


def verify_step_artifacts(
    slug: str, step_n: int, data: dict, state_path: Path, fm_raw: str = ""
) -> list[str]:
    """Required on-disk artifacts before advance to step N (ARTIFACTS.md table)."""
    errors: list[str] = []
    if step_n < 1 or step_n > 9:
        errors.append(f"invalid advance step N={step_n} (standard FSM supports 1–9)")
        return errors

    us_dir = _us_dir(slug, state_path)
    dry_run = str(data.get("dryRun", "false")).lower() == "true"
    skipped = _parse_skipped_steps(data, fm_raw)
    completed = _as_int_list(data.get("completedSteps", []))

    spec = f"step-00-{slug}.spec.md"
    plan = f"step-01-{slug}.plan.md"
    refined = f"step-02-{slug}.plan.refined.md"

    def require(name: str) -> None:
        if not _artifact_exists(us_dir, name):
            rel = us_dir / name
            try:
                display = rel.relative_to(REPO_ROOT)
            except ValueError:
                display = rel
            errors.append(
                f"required artifact missing for advance to step {step_n}: {display}"
            )

    if step_n == 1:
        require(spec)
    elif step_n == 2:
        require(spec)
        require(plan)
    elif step_n == 3:
        require(spec)
        if _artifact_exists(us_dir, refined):
            require(refined)
        else:
            require(plan)
    elif step_n == 4:
        if _artifact_exists(us_dir, refined):
            require(refined)
        else:
            require(plan)
    elif step_n == 5:
        if _artifact_exists(us_dir, refined):
            pass  # refined present
        elif _artifact_exists(us_dir, plan):
            pass  # plan present
        else:
            require(plan)
        if not dry_run:
            manifest = data.get("workflowManifest", {})
            created = manifest.get("created", []) if isinstance(manifest, dict) else []
            artifacts = manifest.get("artifacts", []) if isinstance(manifest, dict) else []
            impl_paths = [
                p for p in list(created) + list(artifacts)
                if p and p not in ("[]", "|")
            ]
            if not impl_paths:
                errors.append(
                    "advance to step 5 requires a non-empty implementation tree "
                    "(workflowManifest created/artifacts) or dryRun: true"
                )
    elif step_n == 6:
        require(f"step-05-{slug}.plan.report.md")
    elif step_n == 7:
        if 6 not in skipped:
            require(f"step-06-{slug}.review.md")
    elif step_n == 8:
        if 7 not in skipped and 7 in completed:
            require(f"step-07-{slug}.testing.report.md")
    elif step_n == 9:
        require(f"step-08-{slug}.result.md")
        if not dry_run:
            errors.extend(_verify_pr_ship_evidence(data, slug, us_dir))

    return errors


def verify_monotonicity(completed_steps: list[int], skipped_steps: set[int]) -> list[str]:
    """completedSteps strictly increasing; no gaps except skippedSteps; no duplicates."""
    errors: list[str] = []
    if not completed_steps:
        return errors

    seen: set[int] = set()
    dupes: list[int] = []
    for step in completed_steps:
        if step in seen:
            dupes.append(step)
        seen.add(step)
    if dupes:
        errors.append(
            f"completedSteps contains duplicates: {sorted(set(dupes))}"
        )

    ordered = sorted(set(completed_steps))
    for i in range(1, len(ordered)):
        if ordered[i] <= ordered[i - 1]:
            errors.append(
                f"completedSteps not strictly increasing when sorted: {completed_steps}"
            )
            break

    if ordered:
        lo, hi = ordered[0], ordered[-1]
        for step in range(lo, hi + 1):
            if step not in ordered and step not in skipped_steps:
                errors.append(
                    f"completedSteps gap at step {step} "
                    f"(must be completed or listed in skippedSteps; "
                    f"completed={ordered}, skipped={sorted(skipped_steps)})"
                )
    return errors


def validate_pre_advance(state_path: Path, step_n: int) -> dict:
    """Pre-dispatch checks before advancing to step N."""
    errors: list[str] = []
    warnings: list[str] = []

    text = state_path.read_text(encoding="utf-8")
    fm = extract_frontmatter(text)
    data = parse_frontmatter(fm)

    workflow_id = str(data.get("workflowId", "")).strip()
    slug = str(data.get("slug", "")).strip()
    if not workflow_id:
        errors.append("mandatory key missing in frontmatter: workflowId")
    if not slug:
        errors.append("mandatory key missing in frontmatter: slug")

    verify_state_version(data, errors)

    completed = _as_int_list(data.get("completedSteps", []))
    skipped = _parse_skipped_steps(data, fm)
    dry_run = str(data.get("dryRun", "false")).lower() == "true"

    if workflow_id:
        tag_errors, tag_warnings = verify_checkpoint_tag(
            workflow_id, step_n, dry_run=dry_run
        )
        errors.extend(tag_errors)
        warnings.extend(tag_warnings)
    if slug:
        errors.extend(verify_step_artifacts(slug, step_n, data, state_path, fm))
    errors.extend(verify_monotonicity(completed, skipped))

    return {
        "state": str(state_path),
        "mode": "pre-advance",
        "preAdvanceStep": step_n,
        "workflowId": workflow_id or None,
        "slug": slug or None,
        "completedSteps": completed,
        "skippedSteps": sorted(skipped),
        "dryRun": dry_run,
        "errors": errors,
        "warnings": warnings,
        "ok": not errors,
    }


def validate(state_path: Path) -> dict:
    errors: list[str] = []
    warnings: list[str] = []

    text = state_path.read_text(encoding="utf-8")
    fm = extract_frontmatter(text)
    data = parse_frontmatter(fm)
    fm_raw = fm  # kept for robust scans (nested commit lists)

    for k in REQUIRED_KEYS:
        if k not in data:
            errors.append(f"mandatory key missing in frontmatter: {k}")

    verify_state_version(data, errors)

    dry_run = str(data.get("dryRun", "false")).lower() == "true"
    status = str(data.get("status", "")).strip().lower()
    # Step 8 cleanup legitimately deletes temp artifacts; missing files on a
    # closed workflow are warnings, not hygiene violations.
    closed = status in ("completed", "cancelled", "failed")
    completed = _as_int_list(data.get("completedSteps", []))

    # currentStep coherence
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



    # files on disk (skip in dry-run)
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

    # commits exist in git (best-effort) — scan raw frontmatter for `sha:` to
    # survive nested YAML list formats the mini-parser does not flatten.
    # Serializer writes inline dicts (`- { sha: "...", step: N, ... }`); a
    # line-anchored `^\s*-?\s*sha:` never matches that form.
    commit_shas = []
    for m in re.finditer(r"\bsha:\s*['\"]?([0-9a-f]{7,40})", fm_raw):
        if m.group(1) not in commit_shas:
            commit_shas.append(m.group(1))
    if not dry_run:
        for sha in commit_shas:
            if not git_commit_exists(sha):
                errors.append(f"registered commit does not exist in git: {sha}")

    return {
        "state": str(state_path),
        "workflowId": data.get("workflowId"),
        "status": data.get("status"),
        "currentStep": current,
        "dryRun": dry_run,
        "completedSteps": completed,
        "files_checked": checked,
        "commits_checked": commit_shas,
        "errors": errors,
        "warnings": warnings,
        "ok": not errors,
    }


def _parse_cli(argv: list[str]) -> tuple[list[str], bool, int | None]:
    """Return (positional args, --json flag, --pre-advance N or None)."""
    as_json = False
    pre_advance: int | None = None
    positional: list[str] = []
    i = 1
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
                pre_advance = int(argv[i + 1].strip())
            except ValueError:
                print(f"Error: --pre-advance value must be an integer: {argv[i + 1]!r}",
                      file=sys.stderr)
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

    positional, as_json, pre_advance = _parse_cli(sys.argv)
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
        if pre_advance is not None:
            result = validate_pre_advance(state_path, pre_advance)
        else:
            result = validate(state_path)
    except (ValueError, OSError) as exc:
        print(f"Error validating {state_path}: {exc}", file=sys.stderr)
        sys.exit(1)

    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif pre_advance is not None:
        print("=" * 50)
        print(f"  validate_state -- pre-advance step {pre_advance}")
        print("=" * 50)
        print(f"State: {result['state']}")
        print(f"Workflow: {result['workflowId']} | slug: {result['slug']}")
        print(f"completedSteps: {result['completedSteps']}")
        print(f"skippedSteps: {result['skippedSteps']}")
        if result["errors"]:
            print("\n## ERRORS", file=sys.stderr)
            for e in result["errors"]:
                print(f"  x {e}", file=sys.stderr)
        else:
            print(f"\n[OK] pre-advance checks passed for step {pre_advance}.")
    else:
        print("=" * 50)
        print("  validate_state -- State Hygiene (v7)")
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
            print("\n## ERRORS", file=sys.stderr)
            for e in result["errors"]:
                print(f"  x {e}", file=sys.stderr)
        else:
            print("\n[OK] state is consistent with manifest and git.")

    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
