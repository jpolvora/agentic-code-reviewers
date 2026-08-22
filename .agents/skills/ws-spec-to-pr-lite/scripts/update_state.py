#!/usr/bin/env python3
"""
update_state -- Automate State Hygiene updates for ws-spec-to-pr-lite state.md (v7)

Usage:
    python update_state.py <state-path> --step <N> --status <status> --elapsed <sec> [--tokens <prompt>:<comp>] [--model <model>] [--label <label>] [--created <file1,file2>] [--modified <file1,file2>] [--deleted <file1,file2>] [--gate-choice <choice>] [--jsonl-out <path>] [--verification-score <int>] [--fable-verdict <str>] [--errors <csv-or-json>] [--bypassed]

--elapsed is required for completed/failed (HS-5 if omitted). Skipped may omit (defaults to 0).

This script:
  1. Parses the frontmatter of state.md.
  2. Appends or updates the step execution telemetry, status, dispatches, models.
  3. Merges files touched into the workflowManifest.
  4. Advances the currentStep.
  5. Upserts ## Telemetry log + appends ## Gate history.
  6. Writes the updated state.md file back cleanly.
  7. Runs validate_state.py on the result.
  8. Optionally appends a flat JSONL telemetry record (--jsonl-out).
"""

import os
import sys
import re
import ast
import json
import datetime
import argparse
from pathlib import Path
import subprocess

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


STEP_LABELS = {
    0: "Spec",
    1: "Planning",
    2: "Implementation",
    3: "Code Review",
    4: "Consolidation",
    5: "Ship & PR",
}

# Current state schema version stamped into the state.yaml frontmatter.
# This writer always emits _STATE_VERSION (never an unknown higher value).
# validate_state.py rejects missing/older/unknown versions (reject loud).
# Keep in sync with the standard copy and with CURRENT_STATE_VERSION in validate_state.py.
_STATE_VERSION = 1

_SECRET_PATTERNS = [
    (re.compile(r"\b(sk-[a-zA-Z0-9]{10,})\b"), "[REDACTED]"),
    (re.compile(r"\b(AKIA[0-9A-Z]{16})\b"), "[REDACTED]"),
    (re.compile(r"(?i)(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+"), r"\1=[REDACTED]"),
    (re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----"), "[REDACTED]"),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "[REDACTED]"),
]

_TELEMETRY_STRING_MAX_LEN = 500


def sanitize_telemetry_string(value: str, max_len: int = _TELEMETRY_STRING_MAX_LEN) -> str:
    """Strip secrets/PII and truncate; never emit source blobs in telemetry."""
    if not value:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    for pattern, repl in _SECRET_PATTERNS:
        text = pattern.sub(repl, text)
    if len(text) > max_len:
        text = text[: max_len - 3] + "..."
    return text


def parse_errors_arg(value: str | None) -> list:
    """Parse --errors as JSON array or comma-separated strings."""
    if not value:
        return []
    raw = value.strip()
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [sanitize_telemetry_string(str(item)) for item in parsed if str(item).strip()]
        except (json.JSONDecodeError, TypeError):
            pass
    return [sanitize_telemetry_string(part) for part in raw.split(",") if part.strip()]


def append_jsonl_record(jsonl_path: Path, record: dict) -> None:
    """Append one flat JSON object per line; create parent dirs lazily."""
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)
    with jsonl_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, separators=(",", ":"), ensure_ascii=False) + "\n")


def resolve_phase_model(step: int, provided_model: str | None, fallback_model: str) -> str:
    """Resolve target phase model from config.json defaults if provided_model is empty (lite mapping)."""
    if provided_model and provided_model.strip():
        return provided_model.strip()

    candidates = [
        shared_dir(resolve_repo_root(script_file=__file__)) / "config.json",
        shared_dir(resolve_repo_root(script_file=__file__)) / "config.json.example",
    ]
    defaults = None
    for cand in candidates:
        if cand.is_file():
            try:
                with open(cand, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    defaults = cfg.get("defaults", {})
                    if isinstance(defaults, dict):
                        break
            except Exception:
                pass

    if isinstance(defaults, dict):
        key = None
        if step in (0, 1):
            key = "plannerModel"
        elif step == 2:
            key = "executionModel"
        elif step == 3:
            key = "reviewerModel"

        if key:
            val = defaults.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()

    return fallback_model or "unknown"


def format_val(v):
    if isinstance(v, bool):
        return str(v).lower()
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        if "\n" in v or ":" in v or "#" in v or "," in v:
            return f'"{v}"'
        return v
    if isinstance(v, dict):
        return format_inline_dict(v)
    return str(v)


def format_inline_dict(item: dict) -> str:
    parts = [f"{subk}: {format_val(subv)}" for subk, subv in item.items()]
    return "{ " + ", ".join(parts) + " }"


def serialize_yaml(data: dict) -> str:
    lines = []
    for k, v in data.items():
        if isinstance(v, dict):
            if not v:
                lines.append(f"{k}: {{}}")
            else:
                lines.append(f"{k}:")
                for subk, subv in v.items():
                    if isinstance(subv, list):
                        if not subv:
                            lines.append(f"  {subk}: []")
                        else:
                            lines.append(f"  {subk}:")
                            for item in subv:
                                if isinstance(item, dict):
                                    lines.append(f"    - {format_inline_dict(item)}")
                                else:
                                    lines.append(f"    - {format_val(item)}")
                    elif isinstance(subv, dict):
                        if not subv:
                            lines.append(f"  {subk}: {{}}")
                        else:
                            lines.append(f"  {subk}: {format_inline_dict(subv)}")
                    else:
                        lines.append(f"  {subk}: {format_val(subv)}")
        elif isinstance(v, list):
            if not v:
                lines.append(f"{k}: []")
            else:
                lines.append(f"{k}:")
                for item in v:
                    if isinstance(item, dict):
                        lines.append(f"  - {format_inline_dict(item)}")
                    else:
                        lines.append(f"  - {format_val(item)}")
        else:
            lines.append(f"{k}: {format_val(v)}")
    return "\n".join(lines)


def parse_inline_dict(s: str) -> dict:
    """Parse { N: 0, label: "foo", ... } or Python-repr {'N': 0, ...}."""
    s = s.strip()
    if s.startswith("{") and s.endswith("}"):
        try:
            obj = ast.literal_eval(s)
            if isinstance(obj, dict):
                return obj
        except (ValueError, SyntaxError):
            pass
    s = s.strip().strip("{}")
    res = {}
    for part in re.split(r",\s*(?=[a-zA-Z0-9_]+:)", s):
        if not part.strip():
            continue
        m = re.match(r"^([a-zA-Z0-9_]+):\s*(.*)$", part.strip())
        if m:
            res[m.group(1)] = _coerce_scalar(m.group(2))
    return res


def _coerce_scalar(val: str):
    v = val.strip().strip('"').strip("'")
    if v.lower() == "true":
        return True
    if v.lower() == "false":
        return False
    if v.lower() == "null":
        return None
    if re.match(r"^-?\d+$", v):
        return int(v)
    return v


def _as_step_ints(val):
    if isinstance(val, list):
        out = []
        for x in val:
            if isinstance(x, bool):
                continue
            if isinstance(x, int):
                out.append(x)
            elif isinstance(x, str) and re.match(r"^\d+$", x.strip()):
                out.append(int(x.strip()))
        return out
    if isinstance(val, bool):
        return []
    if isinstance(val, int):
        return [val]
    if isinstance(val, str) and re.match(r"^\d+$", val.strip()):
        return [int(val.strip())]
    return []


def set_top_level(data, key, value):
    if key == "completedSteps" and key in data:
        merged = sorted(set(_as_step_ints(data[key])) | set(_as_step_ints(value)))
        print("Warning: duplicate completedSteps keys; unioned unique ints", file=sys.stderr)
        data[key] = merged
        return
    data[key] = value


def stamp_state_version(data: dict) -> dict:
    """Stamp the supported stateVersion.

    Missing, non-integer, and older values upgrade to _STATE_VERSION.
    Values above the supported schema are clamped to _STATE_VERSION so this
    writer never emits an unknown version. max(current, _STATE_VERSION) would
    keep e.g. 7 on disk; post-write validation then fails and every retry
    re-stamps 7, blocking recovery without a manual edit.
    """
    data["stateVersion"] = _STATE_VERSION
    return data


def parse_nested_mapping(block_lines: list) -> dict:
    """Parse an indented mapping that may contain nested lists of inline dicts."""
    result = {}
    i = 0
    while i < len(block_lines):
        raw = block_lines[i]
        i += 1
        if not raw.strip():
            continue
        curr_indent = len(raw) - len(raw.lstrip())
        stripped = raw.strip()
        if stripped.startswith("-"):
            continue
        m = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", stripped)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val == "[]":
            result[key] = []
            continue
        if val == "{}":
            result[key] = {}
            continue
        if val != "":
            stripped = val.strip()
            if stripped.startswith("{") and stripped.endswith("}"):
                result[key] = parse_inline_dict(val)
            else:
                result[key] = _coerce_scalar(val)
            continue

        nested_list = []
        nested_map = {}
        saw_list = False
        while i < len(block_lines):
            nxt = block_lines[i]
            if not nxt.strip():
                i += 1
                continue
            nxt_indent = len(nxt) - len(nxt.lstrip())
            if nxt_indent <= curr_indent:
                break
            i += 1
            nxt_s = nxt.strip()
            if nxt_s.startswith("-"):
                saw_list = True
                item = nxt_s[1:].strip()
                if item.startswith("{"):
                    nested_list.append(parse_inline_dict(item))
                else:
                    nested_list.append(_coerce_scalar(item))
            else:
                bm = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", nxt_s)
                if bm:
                    bval = bm.group(2).strip()
                    nested_map[bm.group(1)] = _coerce_scalar(bval) if bval else None
        result[key] = nested_list if saw_list else nested_map
    return result


def elapsed_or_zero(value) -> int:
    """Coerce step elapsedSec to int; null/missing → 0 (safe for total sum)."""
    if value is None or isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and re.match(r"^-?\d+$", value.strip()):
        return int(value.strip())
    return 0


def upsert_telemetry_log(
    content: str,
    step: int,
    label: str,
    model: str,
    elapsed: int,
    tokens: int,
) -> str:
    """Ensure ## Telemetry log table exists and upsert the row for this step."""
    row = f"| Step {step} | {label} | {model} | {elapsed}s | {tokens} |"
    step_pat = re.compile(rf"^\| Step {step} \|[^\n]*$", re.M)

    if "## Telemetry log" not in content:
        block = (
            "## Telemetry log\n\n"
            "| Step | Label | Model | Elapsed | Tokens |\n"
            "|------|-------|-------|---------|--------|\n"
            f"{row}\n"
        )
        if "## Gate history" in content:
            return content.replace("## Gate history", block + "\n## Gate history", 1)
        return content.rstrip() + "\n\n" + block

    if step_pat.search(content):
        return step_pat.sub(row, content, count=1)

    m = re.search(r"(## Telemetry log\n(?:.*?\n)*?)(?=\n## |\Z)", content, re.S)
    if not m:
        return content.rstrip() + "\n" + row + "\n"

    section = m.group(1)
    if "|------" not in section and "| ---" not in section:
        new_section = (
            "## Telemetry log\n\n"
            "| Step | Label | Model | Elapsed | Tokens |\n"
            "|------|-------|-------|---------|--------|\n"
            f"{row}\n"
        )
        return content[: m.start()] + new_section + content[m.end() :]

    new_section = section.rstrip() + "\n" + row + "\n"
    return content[: m.start()] + new_section + content[m.end() :]


def parse_state_yaml(fm: str) -> dict:
    data = {}
    lines = fm.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        i += 1
        if not line.strip() or line.lstrip().startswith("#"):
            continue

        m = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()

        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            parsed = [x.strip().strip('"').strip("'") for x in inner.split(",") if x.strip()] if inner else []
            if parsed and all(re.match(r"^\d+$", x) for x in parsed):
                parsed = [int(x) for x in parsed]
            set_top_level(data, key, parsed)
            continue

        if val == "" or val == "|":
            block_lines = []
            while i < len(lines) and (lines[i].startswith(("  ", "\t")) or not lines[i].strip()):
                block_lines.append(lines[i])
                i += 1

            non_empty = [bl for bl in block_lines if bl.strip()]
            if non_empty and all(bl.strip().startswith("-") for bl in non_empty):
                parsed_block = []
                for bl in non_empty:
                    item = bl.strip()[1:].strip()
                    if item.startswith("{"):
                        parsed_block.append(parse_inline_dict(item))
                    else:
                        parsed_block.append(_coerce_scalar(item))
                set_top_level(data, key, parsed_block)
            else:
                set_top_level(data, key, parse_nested_mapping(block_lines))
            continue

        if val == "{}":
            set_top_level(data, key, {})
            continue
        if val == "[]":
            set_top_level(data, key, [])
            continue

        stripped_val = val.strip()
        if stripped_val.startswith("{") and stripped_val.endswith("}"):
            set_top_level(data, key, parse_inline_dict(val))
        else:
            set_top_level(data, key, _coerce_scalar(val))
    return data


def main():
    ensure_utf8_stdio()
    parser = argparse.ArgumentParser(description="Update ws-spec-to-pr-lite state.md frontmatter")
    parser.add_argument("state_path", type=str, help="Path to state.md file")
    parser.add_argument("--step", type=int, required=True, help="Step number that just completed")
    parser.add_argument("--status", type=str, default="completed", choices=["completed", "failed", "skipped"], help="Step status")
    parser.add_argument(
        "--elapsed",
        type=int,
        default=None,
        help="Elapsed agent seconds for the step (required for completed/failed; 0 OK for skipped)",
    )
    parser.add_argument("--tokens", type=str, help="Tokens as prompt:completion (e.g. 1500:500)")
    parser.add_argument("--model", type=str, help="Model name used for the step")
    parser.add_argument("--created", type=str, help="Comma-separated list of created files")
    parser.add_argument("--modified", type=str, help="Comma-separated list of modified files")
    parser.add_argument("--deleted", type=str, help="Comma-separated list of deleted files")
    parser.add_argument("--gate-choice", type=str, help="Choice chosen at the transition gate")
    parser.add_argument("--label", type=str, help="Step label (defaults from step number)")
    parser.add_argument("--jsonl-out", type=str, help="Append flat JSONL telemetry record to this path")
    parser.add_argument("--verification-score", type=int, default=None, help="Verification score (Steps 3/4)")
    parser.add_argument("--fable-verdict", type=str, default=None, help="Fable judge verdict (Steps 3/4/5)")
    parser.add_argument("--errors", type=str, default=None, help="Errors as comma-separated list or JSON array")
    parser.add_argument("--bypassed", action="store_true", help="Record that quality gates were bypassed")

    args = parser.parse_args()
    if args.elapsed is None:
        if args.status == "skipped":
            args.elapsed = 0
        else:
            print(
                "Error: --elapsed <sec> is required for completed/failed steps "
                "(HS-5 — do not default to 0; measure wall-clock of the step)."
            )
            sys.exit(1)
    if args.elapsed < 0:
        print("Error: --elapsed must be >= 0")
        sys.exit(1)

    state_path = Path(args.state_path)
    if not state_path.exists():
        print(f"Error: state file not found at {state_path}")
        sys.exit(1)

    content = state_path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if not m:
        print("Error: frontmatter YAML marker not found in state file")
        sys.exit(1)

    fm_text = m.group(1)
    body_text = m.group(2)

    data = parse_state_yaml(fm_text)

    step = args.step
    iso_now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    completed_steps = data.get("completedSteps", [])
    if not isinstance(completed_steps, list):
        completed_steps = []
    if step not in completed_steps:
        completed_steps.append(step)
    completed_steps.sort()
    data["completedSteps"] = completed_steps

    step_status = data.get("stepStatus", {})
    if not isinstance(step_status, dict):
        step_status = {}
    step_status[str(step)] = args.status
    data["stepStatus"] = step_status

    if args.status == "skipped":
        skipped_steps = data.get("skippedSteps", [])
        if not isinstance(skipped_steps, list):
            skipped_steps = []
        if step not in skipped_steps:
            skipped_steps.append(step)
        skipped_steps.sort()
        data["skippedSteps"] = skipped_steps

    step_dispatches = data.get("stepDispatches", [])
    if not isinstance(step_dispatches, list):
        step_dispatches = []
    found_disp = False
    for disp in step_dispatches:
        if isinstance(disp, dict) and disp.get("step") == step:
            disp["dispatched"] = iso_now
            found_disp = True
            break
    if not found_disp:
        step_dispatches.append({"step": step, "dispatched": iso_now})
    data["stepDispatches"] = step_dispatches

    current_model = resolve_phase_model(step, args.model, data.get("currentModel", "unknown"))
    step_models = data.get("stepModels", [])
    if not isinstance(step_models, list):
        step_models = []
    found_model = False
    for sm in step_models:
        if isinstance(sm, dict) and sm.get("step") == step:
            sm["model"] = current_model
            sm["dispatched"] = iso_now
            found_model = True
            break
    if not found_model:
        step_models.append({"step": step, "model": current_model, "dispatched": iso_now})
    data["stepModels"] = step_models
    data["currentModel"] = current_model

    created_list = [x.strip() for x in args.created.split(",") if x.strip()] if args.created else []
    modified_list = [x.strip() for x in args.modified.split(",") if x.strip()] if args.modified else []
    deleted_list = [x.strip() for x in args.deleted.split(",") if x.strip()] if args.deleted else []

    manifest = data.get("workflowManifest", {})
    if not isinstance(manifest, dict):
        manifest = {}
    manifest_created = manifest.get("created", [])
    if not isinstance(manifest_created, list):
        manifest_created = []
    manifest_artifacts = manifest.get("artifacts", [])
    if not isinstance(manifest_artifacts, list):
        manifest_artifacts = []

    for f in created_list:
        if f not in manifest_created:
            manifest_created.append(f)
    for f in deleted_list:
        if f in manifest_created:
            manifest_created.remove(f)

    manifest["created"] = manifest_created
    manifest["artifacts"] = manifest_artifacts
    data["workflowManifest"] = manifest

    telemetry = data.get("telemetry", {})
    if not isinstance(telemetry, dict):
        telemetry = {}
    telemetry_steps = telemetry.get("steps", [])
    if not isinstance(telemetry_steps, list):
        telemetry_steps = []

    prompt_tok, comp_tok = 0, 0
    if args.tokens:
        tok_parts = args.tokens.split(":")
        if len(tok_parts) == 2:
            try:
                prompt_tok = int(tok_parts[0])
                comp_tok = int(tok_parts[1])
            except ValueError:
                pass

    files_count = len(created_list) + len(modified_list) + len(deleted_list)

    step_label = args.label or STEP_LABELS.get(step, f"Step {step}")

    step_telemetry = {
        "N": step,
        "label": step_label,
        "dispatchedAt": iso_now,
        "finishedAt": iso_now,
        "elapsedSec": args.elapsed,
        "promptTokens": prompt_tok,
        "completionTokens": comp_tok,
        "estimated": True,
        "model": current_model,
        "filesTouched": files_count,
    }

    replaced_tel = False
    for i_tel, tel in enumerate(telemetry_steps):
        if isinstance(tel, dict) and tel.get("N") == step:
            telemetry_steps[i_tel] = step_telemetry
            replaced_tel = True
            break
    if not replaced_tel:
        telemetry_steps.append(step_telemetry)
    telemetry["steps"] = telemetry_steps

    total_elapsed = sum(elapsed_or_zero(t.get("elapsedSec") if isinstance(t, dict) else 0) for t in telemetry_steps)
    total_tokens = sum(
        ((t.get("promptTokens") or 0) + (t.get("completionTokens") or 0) if isinstance(t, dict) else 0)
        for t in telemetry_steps
    )

    telemetry["totalElapsedSec"] = total_elapsed
    telemetry["totalTokens"] = total_tokens
    telemetry["workflowEndedAt"] = iso_now
    if not telemetry.get("workflowStartedAt"):
        telemetry["workflowStartedAt"] = data.get("startedAt") or iso_now
    data["telemetry"] = telemetry

    next_step = step + 1

    data["currentStep"] = next_step
    data["workflowType"] = "lite"

    gate_choice = args.gate_choice or f"Advance to Step {next_step}"

    stamp_state_version(data)

    serialized_fm = serialize_yaml(data)
    new_content = f"---\n{serialized_fm}\n---\n{body_text}"

    token_sum = prompt_tok + comp_tok
    new_content = upsert_telemetry_log(
        new_content, step, step_label, current_model, args.elapsed, token_sum
    )

    if "## Gate history" in new_content:
        gate_line = f"- auto-gate | step {step} | {gate_choice} | {iso_now}"
        new_content = new_content.replace("## Gate history", f"## Gate history\n{gate_line}", 1)

    state_path.write_text(new_content, encoding="utf-8")
    print(f"Updated state.md for step {step}. Next step: {next_step}. elapsed={args.elapsed}s")

    validator_path = Path(__file__).resolve().parent / "validate_state.py"
    if validator_path.exists():
        r = subprocess.run(
            [sys.executable, str(validator_path), str(state_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if r.returncode != 0:
            print("Validation FAILED after update:")
            print(r.stdout)
            print(r.stderr)
            sys.exit(1)
        else:
            print("Validation PASSED after update.")

    if args.jsonl_out:
        fable_verdict = (
            sanitize_telemetry_string(args.fable_verdict) if args.fable_verdict is not None else None
        )
        jsonl_record = {
            "timestamp": iso_now,
            "step": step,
            "label": step_label,
            "elapsedSec": args.elapsed,
            "promptTokens": prompt_tok,
            "completionTokens": comp_tok,
            "filesTouched": files_count,
            "model": sanitize_telemetry_string(current_model),
            "verificationScore": args.verification_score,
            "fableVerdict": fable_verdict or None,
            "gateDecision": sanitize_telemetry_string(gate_choice),
            "errors": parse_errors_arg(args.errors),
            "bypassed": bool(args.bypassed),
        }
        append_jsonl_record(Path(args.jsonl_out), jsonl_record)
        if args.bypassed:
            bypass_record = {
                "type": "gate-bypass",
                "gate": "quality-gates",
                "reason": "skip-gates",
                "timestamp": iso_now,
                "step": step,
            }
            append_jsonl_record(Path(args.jsonl_out), bypass_record)
        print(f"Appended JSONL telemetry to {args.jsonl_out}")


if __name__ == "__main__":
    main()
