#!/usr/bin/env python3
"""
Fetch or convert an Azure DevOps work item into the spec of record under {specsDir}.

Fetch (live API):
  set ADO_PAT=...   # or AZURE_DEVOPS_PAT
  python ado-workitem-to-spec.py \\
    --org contoso --project MyProject --id 2416 \\
    --snapshot {plansDir}/us-2416/step-00-us-2416.issue.json

Convert (offline JSON from WIT API):
  python ado-workitem-to-spec.py \\
    --input workitem.json \\
    --org contoso --project MyProject

Output defaults to `{specsDir}/us-{id}.spec.md` (`plans.specsDir` from
ws-shared/config.json, default `.agents/specs`). Promote it to the workflow copy
`{plansDir}/{slug}/step-00-{slug}.spec.md` with ws-local-spec-provider:

  python register_local_spec.py --input {specsDir}/us-2416.spec.md --source azure-devops

`--output` overrides the destination.

API shape expected for --input: Azure DevOps WIT work item JSON
(`GET .../_apis/wit/workitems/{id}?$expand=all&api-version=7.1`).
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

_SHARED_SCRIPTS = Path(__file__).resolve().parents[2] / "ws-shared" / "scripts"
if str(_SHARED_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SHARED_SCRIPTS))
from resolve_consumer_root import resolve_repo_root, resolve_config_path  # noqa: E402


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


DEFAULT_SPECS_DIR = ".agents/specs"

def resolve_specs_dir(repo_root: Path, override: str | None = None) -> Path:
    """Absolute specsDir from --specs-dir, else plans.specsDir, else the portable default."""
    rel = (override or "").strip()
    if not rel:
        cfg: dict = {}
        cfg_path = resolve_config_path(repo_root)
        if cfg_path.is_file():
            try:
                cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                cfg = {}
        rel = ((cfg.get("plans") or {}).get("specsDir") or "").strip() or DEFAULT_SPECS_DIR
    path = Path(rel)
    return path.resolve() if path.is_absolute() else (repo_root / path).resolve()


_AC_HEADING = re.compile(
    r"^(?:#{1,6}\s*)?(crit[eé]rios?\s+de\s+aceite|acceptance\s+criteria|ac[s]?)\b\.?$",
    re.IGNORECASE,
)


def clean_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    text = re.sub(r"</(p|div|h[1-6]|li|tr)\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<(p|div|h[1-6]|li|tr)(\s[^>]*)?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def split_body(body: str) -> tuple[str, list[str]]:
    """Return (description, acceptance-criteria items)."""
    body = (body or "").replace("\r\n", "\n").strip()
    if not body:
        return "", []

    lines = body.split("\n")
    ac_start = None
    for idx, line in enumerate(lines):
        if _AC_HEADING.match(line.strip()):
            ac_start = idx
            break

    if ac_start is None:
        return body, []

    description = "\n".join(lines[:ac_start]).strip()
    ac_items: list[str] = []
    for line in lines[ac_start + 1 :]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            break
        item = re.sub(r"^[-*+]\s+|^\d+[.)]\s+|^\[[ xX]\]\s+", "", stripped).strip()
        item = re.sub(r"^-?\s*\[[ xX]\]\s*", "", item).strip()
        if item:
            ac_items.append(item)
    return description, ac_items


def resolve_pat(pat_env_var: str) -> str:
    for key in (pat_env_var, "ADO_PAT", "AZURE_DEVOPS_PAT"):
        if not key:
            continue
        value = os.environ.get(key, "").strip()
        if value:
            return value
    raise SystemExit(
        f"Missing PAT. Set env var {pat_env_var or 'ADO_PAT'} (or AZURE_DEVOPS_PAT)."
    )


def auth_headers(pat: str) -> dict[str, str]:
    token = base64.b64encode(f":{pat}".encode("ascii")).decode("ascii")
    return {
        "Authorization": f"Basic {token}",
        "Accept": "application/json; api-version=7.1",
        "Content-Type": "application/json",
    }


def fetch_work_item(org: str, project: str, work_item_id: int, pat: str, api_base: str) -> dict:
    base = api_base.rstrip("/")
    project_q = urllib.parse.quote(project)
    url = (
        f"{base}/{urllib.parse.quote(org)}/{project_q}"
        f"/_apis/wit/workitems/{work_item_id}?$expand=all&api-version=7.1"
    )
    request = urllib.request.Request(url, method="GET", headers=auth_headers(pat))
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Azure DevOps HTTP {exc.code}: {detail}") from exc
    return json.loads(raw.decode("utf-8"))


def load_work_item(raw: str) -> dict:
    data = json.loads(raw)
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict):
        raise ValueError("Work item JSON must be an object")
    return data


def work_item_slug(work_item: dict) -> str:
    fields = work_item.get("fields") or {}
    number = work_item.get("id") or fields.get("System.Id")
    return f"us-{number}" if number else "spec"


def build_spec_md(work_item: dict, org: str | None, project: str | None) -> str:
    fields = work_item.get("fields") or {}
    number = work_item.get("id") or fields.get("System.Id")
    slug = work_item_slug(work_item)
    title = (fields.get("System.Title") or (f"US {number}" if number else "Specification")).strip()
    state = (fields.get("System.State") or "").strip()
    work_item_type = (fields.get("System.WorkItemType") or "").strip()
    assigned = fields.get("System.AssignedTo") or {}
    assignee = assigned.get("displayName") or assigned.get("uniqueName") or ""
    tags_raw = fields.get("System.Tags") or ""
    tags = [t.strip() for t in tags_raw.split(";") if t.strip()] if isinstance(tags_raw, str) else []

    description_html = fields.get("System.Description") or fields.get("Microsoft.VSTS.TCM.ReproSteps") or ""
    description_text = clean_html(description_html)
    ac_html = fields.get("Microsoft.VSTS.Common.AcceptanceCriteria") or ""
    ac_text = clean_html(ac_html)

    description, ac_from_desc = split_body(description_text)
    ac_items: list[str] = []
    if ac_text:
        # Prefer dedicated AcceptanceCriteria field when present
        _, ac_from_field = split_body(
            ac_text if _AC_HEADING.search(ac_text) else f"## Acceptance Criteria\n{ac_text}"
        )
        if ac_from_field:
            ac_items = ac_from_field
        else:
            for line in ac_text.split("\n"):
                item = re.sub(r"^[-*+]\s+|^\d+[.)]\s+|^\[[ xX]\]\s+", "", line.strip()).strip()
                if item:
                    ac_items.append(item)
    if not ac_items:
        ac_items = ac_from_desc
        # Keep full description when ACs were only discovered inside it
        if not ac_from_desc:
            description = description_text
    # When dedicated AC field supplied ACs, description already excludes the AC block via split_body

    if org and project and number:
        url = (
            f"https://dev.azure.com/{urllib.parse.quote(org)}/"
            f"{urllib.parse.quote(project)}/_workitems/edit/{number}"
        )
    else:
        url = work_item.get("url") or work_item.get("_links", {}).get("html", {}).get("href") or ""

    fm = [
        "---",
        f"id: {number if number else 'null'}",
        f"slug: {slug}",
        f'title: "{title.replace(chr(34), chr(39))}"',
        "source: azure-devops",
    ]
    if state:
        fm.append(f"issueState: {state}")
    if work_item_type:
        fm.append(f'workItemType: "{work_item_type}"')
    if url:
        fm.append(f'issueUrl: "{url}"')
    if tags:
        fm.append(f"labels: [{', '.join(tags)}]")
    fm.append(f"specDate: {date.today().isoformat()}")
    fm.append("---")
    fm.append("")

    body: list[str] = [f"# Specification — {title}", ""]
    meta = []
    if work_item_type:
        meta.append(f"**Type:** {work_item_type}")
    if state:
        meta.append(f"**State:** {state}")
    if assignee:
        meta.append(f"**Assignee:** {assignee}")
    if tags:
        meta.append(f"**Tags:** {', '.join(tags)}")
    if meta:
        body.extend(meta)
        body.append("")

    body.append("## Description")
    body.append("")
    body.append(description or "_No description in the work item._")
    body.append("")

    body.append("## Acceptance Criteria")
    body.append("")
    if ac_items:
        for idx, ac in enumerate(ac_items, 1):
            body.append(f"- AC{idx}: {ac}")
    else:
        body.append(
            "_No explicit acceptance criteria in the work item — extract/validate during refinement._"
        )
    body.append("")

    body.append("## Notes")
    body.append("")
    body.append("_Automatically generated from Azure DevOps work item JSON._")
    body.append("")

    return "\n".join(fm + body)


def main() -> int:
    ensure_utf8_stdio()

    parser = argparse.ArgumentParser(
        description="Fetch/convert Azure DevOps work item JSON into canonical *.spec.md"
    )
    parser.add_argument("--input", help="Path to WIT JSON file, or '-' for stdin (offline mode)")
    parser.add_argument(
        "--output",
        help="Output path for *.spec.md (default: {specsDir}/us-{id}.spec.md)",
    )
    parser.add_argument("--specs-dir", help="Override plans.specsDir for the default output path")
    parser.add_argument(
        "--repo-root",
        help="Project root owning ws-shared/config.json (default: CWD when it has a hub)",
    )
    parser.add_argument("--snapshot", help="Optional path to write raw issue/work-item JSON")
    parser.add_argument("--id", type=int, help="Work item id (live fetch mode)")
    parser.add_argument("--org", default="", help="Azure DevOps organization")
    parser.add_argument("--project", default="", help="Azure DevOps project")
    parser.add_argument(
        "--api-base",
        default="https://dev.azure.com",
        help="API base URL (default https://dev.azure.com)",
    )
    parser.add_argument(
        "--pat-env",
        default="ADO_PAT",
        help="Env var name holding the PAT (default ADO_PAT; also tries AZURE_DEVOPS_PAT)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing spec of record when content differs",
    )
    args = parser.parse_args()

    if args.input:
        if args.input == "-":
            raw = sys.stdin.read()
        else:
            input_path = Path(args.input)
            if not input_path.is_file():
                print(f"Error: input file not found: {input_path}", file=sys.stderr)
                return 1
            raw = input_path.read_text(encoding="utf-8")
        try:
            work_item = load_work_item(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            print(f"Error: invalid JSON — {exc}", file=sys.stderr)
            return 1
    elif args.id is not None:
        if not args.org or not args.project:
            print("Error: --org and --project are required for live fetch", file=sys.stderr)
            return 1
        pat = resolve_pat(args.pat_env)
        work_item = fetch_work_item(args.org, args.project, args.id, pat, args.api_base)
        if args.snapshot:
            snap = Path(args.snapshot)
            snap.parent.mkdir(parents=True, exist_ok=True)
            snap.write_text(json.dumps(work_item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Snapshot written to: {snap}")
    else:
        print("Error: provide --input (offline) or --id with --org/--project (live)", file=sys.stderr)
        return 1

    if args.snapshot and args.input:
        snap = Path(args.snapshot)
        snap.parent.mkdir(parents=True, exist_ok=True)
        snap.write_text(json.dumps(work_item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Snapshot written to: {snap}")

    spec_md = build_spec_md(work_item, args.org or None, args.project or None)

    if args.output:
        output_path = Path(args.output)
    else:
        repo_root = resolve_repo_root(args.repo_root, script_file=__file__)
        output_path = resolve_specs_dir(repo_root, args.specs_dir) / f"{work_item_slug(work_item)}.spec.md"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() and not args.force:
        existing = output_path.read_text(encoding="utf-8").replace("\r\n", "\n")
        if existing != spec_md.replace("\r\n", "\n"):
            print(
                f"ERROR: spec of record exists and differs: {output_path}\n"
                "Preserve your edits or pass --force to overwrite.",
                file=sys.stderr,
            )
            return 1
    output_path.write_text(spec_md, encoding="utf-8")
    print(f"Spec written to: {output_path}")
    print("Next: register into the workflow copy via ws-local-spec-provider")
    print(f"  register_local_spec.py --input {output_path} --source azure-devops")
    return 0


if __name__ == "__main__":
    sys.exit(main())
