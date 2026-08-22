#!/usr/bin/env python3
"""
Prior-work sweep for Azure DevOps: search PRs and recent commits.

Usage:
  python sweep_prior_work.py --keywords auth login [--issue 1234] [--files path/a]
  python sweep_prior_work.py --dry-run --keywords test

stdout: JSON with repo-relative paths only. validate-auth first.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


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

HUB_REL = Path(".agents") / "skills" / "ws-shared" / "config.json"


def resolve_repo_root(override: str | None = None) -> Path:
    if override:
        return Path(override).expanduser().resolve()
    cwd = Path.cwd().resolve()
    if (cwd / HUB_REL).is_file():
        return cwd
    return Path(__file__).resolve().parents[4]


def to_repo_relative(repo_root: Path, path: str | Path) -> str:
    p = Path(path)
    try:
        rel = p.resolve().relative_to(repo_root.resolve())
        return rel.as_posix()
    except ValueError:
        s = str(path).replace("\\", "/")
        if re.match(r"^[A-Za-z]:/", s):
            return Path(s).name
        return s.lstrip("/")


def load_ado_config(repo_root: Path) -> dict[str, Any]:
    cfg_path = repo_root / HUB_REL
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


def validate_auth(ado: dict[str, Any], dry_run: bool) -> tuple[bool, str]:
    org = (ado.get("org") or "").strip()
    project = (ado.get("project") or "").strip()
    pat_env = (ado.get("patEnvVar") or "ADO_PAT").strip()
    pat = resolve_pat(pat_env)
    if not org or not project:
        msg = "Missing issueTrackers.azureDevOps org/project in config.json"
        if dry_run:
            return False, msg
        print(msg, file=sys.stderr)
        print("Fix: configure issueTrackers.azureDevOps (validate-auth)", file=sys.stderr)
        return False, msg
    if not pat:
        msg = f"Missing PAT: set {pat_env} or ADO_PAT (validate-auth)"
        if dry_run:
            return False, msg
        print(msg, file=sys.stderr)
        print("Fix: configure issueTrackers.azureDevOps and set ADO_PAT (validate-auth)", file=sys.stderr)
        return False, msg
    return True, ""


def api_get(url: str, pat: str) -> Any:
    req = urllib.request.Request(url)
    token = base64.b64encode(f":{pat}".encode("utf-8")).decode("ascii")
    req.add_header("Authorization", f"Basic {token}")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


ADO_STATE_TO_GH = {"active": "OPEN", "completed": "CLOSED", "abandoned": "CLOSED"}


def pr_web_url(pr: dict[str, Any]) -> str:
    links = pr.get("_links") or {}
    web = (links.get("web") or {}).get("href")
    if web:
        return str(web)
    return str(pr.get("url") or "")


def normalize_head_ref(ref: str | None) -> str:
    if not ref:
        return ""
    value = str(ref).strip()
    prefix = "refs/heads/"
    return value[len(prefix) :] if value.startswith(prefix) else value


def pr_row(pr: dict[str, Any], search_text: str) -> dict[str, Any]:
    pid = pr.get("pullRequestId")
    native_status = pr.get("status")
    normalized_state = ADO_STATE_TO_GH.get(str(native_status or "").lower(), native_status or "")
    src = normalize_head_ref(pr.get("sourceRefName"))
    return {
        "number": pid,
        "pullRequestId": pid,
        "title": pr.get("title") or "",
        "state": normalized_state,
        "status": native_status,
        "url": pr_web_url(pr),
        "headRefName": src,
        "sourceRefName": src,
        "searchText": search_text,
    }


def list_project_prs(ado: dict[str, Any], pat: str, top: int = 100) -> list[dict[str, Any]]:
    org = ado["org"]
    project = ado["project"]
    api_base = (ado.get("apiBase") or "https://dev.azure.com").rstrip("/")
    url = (
        f"{api_base}/{org}/{project}/_apis/git/pullrequests"
        f"?searchCriteria.status=all&$top={top}&api-version=7.1"
    )
    try:
        data = api_get(url, pat)
    except (urllib.error.URLError, json.JSONDecodeError, KeyError):
        return []
    return list(data.get("value") or [])


def fetch_pr_by_id(ado: dict[str, Any], pat: str, pull_request_id: int) -> dict[str, Any] | None:
    org = ado["org"]
    project = ado["project"]
    api_base = (ado.get("apiBase") or "https://dev.azure.com").rstrip("/")
    url = f"{api_base}/{org}/{project}/_apis/git/pullrequests/{pull_request_id}?api-version=7.1"
    try:
        return api_get(url, pat)
    except (urllib.error.URLError, json.JSONDecodeError, KeyError):
        return None


def parse_pr_id_from_relation(url: str) -> int | None:
    if "PullRequestId" not in url:
        return None
    decoded = urllib.parse.unquote(url)
    match = re.search(r"PullRequestId[/\\](?:[^/%\\]+[/\\]){2}(\d+)\b", decoded, re.I)
    if match:
        return int(match.group(1))
    match = re.search(r"PullRequestId[/\\](\d+)\b", decoded, re.I)
    if match:
        return int(match.group(1))
    return None


def search_prs_by_work_item(ado: dict[str, Any], pat: str, work_item_id: int) -> list[dict[str, Any]]:
    org = ado["org"]
    project = ado["project"]
    api_base = (ado.get("apiBase") or "https://dev.azure.com").rstrip("/")
    url = (
        f"{api_base}/{org}/{project}/_apis/wit/workitems/{work_item_id}"
        f"?$expand=relations&api-version=7.1"
    )
    try:
        data = api_get(url, pat)
    except (urllib.error.URLError, json.JSONDecodeError, KeyError):
        return []
    rows: list[dict[str, Any]] = []
    seen: set[int] = set()
    search_text = str(work_item_id)
    for rel in data.get("relations") or []:
        rel_url = rel.get("url") or ""
        pr_id = parse_pr_id_from_relation(rel_url)
        if pr_id is None or pr_id in seen:
            continue
        pr = fetch_pr_by_id(ado, pat, pr_id)
        if not pr:
            continue
        seen.add(pr_id)
        rows.append(pr_row(pr, search_text))
    return rows


def search_prs(ado: dict[str, Any], pat: str, search_text: str) -> list[dict[str, Any]]:
    needle = search_text.strip().lower()
    if not needle:
        return []
    rows: list[dict[str, Any]] = []
    for pr in list_project_prs(ado, pat):
        title = (pr.get("title") or "")
        desc = (pr.get("description") or "")
        hay = f"{title} {desc}".lower()
        if needle not in hay:
            continue
        rows.append(pr_row(pr, search_text))
    return rows


def git_log(repo_root: Path, files: list[str]) -> list[dict[str, str]]:
    if not files:
        return []
    rel_files = [to_repo_relative(repo_root, f) for f in files]
    proc = subprocess.run(
        ["git", "log", "--oneline", "-20", "--", *rel_files],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        return []
    commits = []
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split(" ", 1)
        commits.append({"sha": parts[0], "subject": parts[1] if len(parts) > 1 else "", "files": rel_files})
    return commits


def main() -> int:
    parser = argparse.ArgumentParser(description="Sweep prior work on Azure DevOps")
    parser.add_argument("--issue", type=int, default=None)
    parser.add_argument("--keywords", nargs="+", default=[])
    parser.add_argument("--files", nargs="*", default=[])
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--dry-run", action="store_true", help="Advisory mode; skip remote when auth missing")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    ado = load_ado_config(repo_root)
    auth_ok, auth_msg = validate_auth(ado, args.dry_run)
    if not auth_ok and not args.dry_run:
        return 1
    if not auth_ok and args.dry_run:
        payload = {
            "status": "skipped",
            "reason": auth_msg or "ADO auth not configured",
            "provider": "azure-devops",
            "issue": args.issue,
            "keywords": args.keywords,
            "pullRequests": [],
            "commits": git_log(repo_root, args.files),
            "repoRoot": ".",
        }
        print(json.dumps(payload, indent=2))
        return 0

    pat_env = (ado.get("patEnvVar") or "ADO_PAT").strip()
    pat = resolve_pat(pat_env)
    prs: list[dict[str, Any]] = []
    seen: set[int | None] = set()
    if args.issue is not None:
        for row in search_prs_by_work_item(ado, pat, args.issue):
            pid = row.get("pullRequestId")
            if pid not in seen:
                seen.add(pid)
                prs.append(row)
        for row in search_prs(ado, pat, str(args.issue)):
            pid = row.get("pullRequestId")
            if pid not in seen:
                seen.add(pid)
                prs.append(row)
    kw = " ".join(args.keywords).strip()
    if kw:
        for row in search_prs(ado, pat, kw):
            pid = row.get("pullRequestId")
            if pid not in seen:
                seen.add(pid)
                prs.append(row)

    payload = {
        "status": "ok",
        "provider": "azure-devops",
        "issue": args.issue,
        "keywords": args.keywords,
        "pullRequests": prs,
        "commits": git_log(repo_root, args.files),
        "repoRoot": ".",
    }
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
