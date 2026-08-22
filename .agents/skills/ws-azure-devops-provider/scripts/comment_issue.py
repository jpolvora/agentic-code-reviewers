#!/usr/bin/env python3
"""
Post a work-item comment on Azure DevOps (comment-issue intent).

WIT Comments REST api-version=7.1 (not PR discussion threads).
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

_SHARED_SCRIPTS = Path(__file__).resolve().parents[2] / "ws-shared" / "scripts"
if str(_SHARED_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SHARED_SCRIPTS))
from resolve_consumer_root import resolve_repo_root, resolve_config_path  # noqa: E402


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

def load_ado_config(repo_root: Path) -> dict[str, Any]:
    cfg_path = resolve_config_path(repo_root)
    if not cfg_path.is_file():
        return {}
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return (cfg.get("issueTrackers") or {}).get("azureDevOps") or {}


def resolve_pat(pat_env_var: str) -> str:
    for key in (pat_env_var, "ADO_PAT", "AZURE_DEVOPS_PAT"):
        if not key:
            continue
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return ""


def validate_auth(ado: dict[str, Any]) -> tuple[bool, str]:
    org = (ado.get("org") or "").strip()
    project = (ado.get("project") or "").strip()
    pat_env = (ado.get("patEnvVar") or "ADO_PAT").strip()
    if not org or not project:
        return False, "Missing issueTrackers.azureDevOps org/project"
    if not resolve_pat(pat_env):
        return False, f"Missing PAT: set {pat_env} or ADO_PAT (validate-auth)"
    return True, ""


def post_comment(ado: dict[str, Any], work_item_id: int, body: str, pat: str) -> None:
    org = ado["org"]
    project = ado["project"]
    api_base = (ado.get("apiBase") or "https://dev.azure.com").rstrip("/")
    url = (
        f"{api_base}/{org}/{project}/_apis/wit/workItems/{work_item_id}/comments"
        f"?api-version=7.1"
    )
    payload = json.dumps({"text": body}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    token = base64.b64encode(f":{pat}".encode("utf-8")).decode("ascii")
    req.add_header("Authorization", f"Basic {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        resp.read()


def main() -> int:
    parser = argparse.ArgumentParser(description="Comment on ADO work item (comment-issue)")
    parser.add_argument("--id", required=True)
    parser.add_argument("--body-file", default=None)
    parser.add_argument("--body", default=None)
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    issue_raw = str(args.id).strip().lower()
    if issue_raw in ("null", "none", ""):
        print(json.dumps({"status": "skipped", "reason": "no tracker id"}))
        return 0

    try:
        work_item_id = int(args.id)
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

    if args.dry_run:
        print(json.dumps({"status": "dry-run", "workItemId": work_item_id, "body": body.strip()}))
        return 0

    repo_root = resolve_repo_root(args.repo_root, script_file=__file__)
    ado = load_ado_config(repo_root)
    ok, msg = validate_auth(ado)
    if not ok:
        print(msg, file=sys.stderr)
        return 1

    pat_env = (ado.get("patEnvVar") or "ADO_PAT").strip()
    pat = resolve_pat(pat_env)
    try:
        post_comment(ado, work_item_id, body.strip(), pat)
    except urllib.error.URLError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(json.dumps({"status": "ok", "workItemId": work_item_id}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
