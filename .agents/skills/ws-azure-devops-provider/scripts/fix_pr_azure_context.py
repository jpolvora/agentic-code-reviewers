#!/usr/bin/env python3
"""
Cross-platform fix-pr helper for Azure DevOps.

Goals:
- Standardize collection of PR, threads, comments, and work items.
- Authenticate in a self-contained way without depending on other scripts.
- Avoid each fix-pr run inventing a different REST call.

Config preference:
  1. `.agents/skills/ws-shared/config.json` → `issueTrackers.azureDevOps` + env PAT
  2. Legacy `.agents/skills/azure-devops/azure-devops.config.json` (+ optional `.secret`)

Usage:
  python .agents/skills/ws-azure-devops-provider/scripts/fix_pr_azure_context.py collect --pr-id 592 --output .agents/skills/ws-fix-pr/runs/pr-592/context.json
  python .agents/skills/ws-azure-devops-provider/scripts/fix_pr_azure_context.py resolve-thread --pr-id 592 --thread-id 4001 --model composer-2.5 --comment "Justification..."
  python .agents/skills/ws-azure-devops-provider/scripts/fix_pr_azure_context.py resolve-thread --dry-run --pr-id 592 --thread-id 4001 --model composer-2.5 --comment "Justification..."
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
from pathlib import Path
from typing import Any


ACTIVE_STATUSES = {"active", "pending"}
DEFAULT_WORK_ITEM_FIELDS = ",".join(
    [
        "System.Id",
        "System.Title",
        "System.State",
        "System.WorkItemType",
        "System.Description",
        "Microsoft.VSTS.Common.AcceptanceCriteria",
    ]
)


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


def find_repo_root(start: Path) -> Path:
    current = start.expanduser().resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".agents").is_dir() or (candidate / ".git").exists():
            return candidate
    if current.is_dir():
        return current
    raise SystemExit("Could not locate repository root containing .agents/ or .git.")


def resolve_pat(pat_env_var: str, secret_path: Path | None = None) -> str:
    for key in (pat_env_var, "ADO_PAT", "AZURE_DEVOPS_PAT"):
        if not key:
            continue
        value = os.environ.get(key, "").strip()
        if value:
            return value
    if secret_path and secret_path.exists():
        value = secret_path.read_text(encoding="utf-8").strip()
        if value:
            return value
    return ""


def resolve_azdo_legacy_paths(repo_root: Path) -> tuple[Path, Path]:
    skill_dir = repo_root / ".agents" / "skills" / "azure-devops"
    config_path = skill_dir / "azure-devops.config.json"
    secret_path = skill_dir / "azure-devops.secret"

    if config_path.exists():
        return config_path, secret_path

    # Compatibility with older location under .agents/
    legacy_dir = repo_root / ".agents"
    legacy_config_path = legacy_dir / "azure-devops.config.json"
    legacy_secret_path = legacy_dir / "azure-devops.secret"
    if legacy_config_path.exists():
        return legacy_config_path, legacy_secret_path

    return config_path, secret_path


def load_spec_to_pr_ado_config(repo_root: Path) -> dict[str, Any] | None:
    for rel_path in (
        Path(".agents") / "skills" / "ws-shared" / "config.json",
        Path(".agents") / "skills" / "shared" / "config.json",
    ):
        config_path = repo_root / rel_path
        if config_path.exists():
            break
    else:
        return None
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    ado = (config.get("issueTrackers") or {}).get("azureDevOps") or {}
    if not isinstance(ado, dict):
        return None
    org = str(ado.get("org") or "").strip()
    project = str(ado.get("project") or "").strip()
    if not org or not project:
        return None
    return ado


def load_azdo_config(repo_root: Path) -> tuple[str, str, str]:
    _, legacy_secret_path = resolve_azdo_legacy_paths(repo_root)

    ado = load_spec_to_pr_ado_config(repo_root)
    if ado is not None:
        organization = str(ado.get("org") or "").strip()
        project = str(ado.get("project") or "").strip()
        pat_env_var = str(ado.get("patEnvVar") or "ADO_PAT").strip() or "ADO_PAT"
        pat = resolve_pat(pat_env_var, legacy_secret_path)
        if not pat:
            raise SystemExit(
                f"Missing PAT. Set env var {pat_env_var} (or ADO_PAT / AZURE_DEVOPS_PAT)."
            )
        return organization, project, pat

    # Legacy fallback only
    config_path, secret_path = resolve_azdo_legacy_paths(repo_root)
    if not config_path.exists():
        raise SystemExit(
            "Configure issueTrackers.azureDevOps (org, project) in "
            ".agents/skills/ws-shared/config.json, or create legacy "
            ".agents/skills/azure-devops/azure-devops.config.json."
        )

    config = json.loads(config_path.read_text(encoding="utf-8"))
    organization = config["organization"]
    project = config["project"]
    pat = resolve_pat("ADO_PAT", secret_path)
    if not pat:
        raise SystemExit(
            "Missing PAT. Set ADO_PAT or AZURE_DEVOPS_PAT, or create "
            ".agents/skills/azure-devops/azure-devops.secret."
        )

    return organization, project, pat


def base_url(organization: str, project: str) -> str:
    return f"https://dev.azure.com/{organization}/{urllib.parse.quote(project)}"


def pr_web_url(pr: dict[str, Any]) -> str:
    links = pr.get("_links") or {}
    web = (links.get("web") or {}).get("href")
    if web:
        return str(web)
    return str(pr.get("url") or "")


def git_url(organization: str, project: str, repository: str, suffix: str) -> str:
    return (
        f"{base_url(organization, project)}/_apis/git/repositories/"
        f"{urllib.parse.quote(repository)}/{suffix}"
    )


def auth_headers(pat: str, content_type: str = "application/json") -> dict[str, str]:
    token = base64.b64encode(f":{pat}".encode("ascii")).decode("ascii")
    return {
        "Authorization": f"Basic {token}",
        "Accept": "application/json; api-version=7.1",
        "Content-Type": content_type,
    }


def azdo_request(
    method: str,
    url: str,
    pat: str,
    body: Any | None = None,
    content_type: str = "application/json",
) -> Any:
    data: bytes | None = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers=auth_headers(pat, content_type=content_type),
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Azure DevOps HTTP {exc.code}: {detail}") from exc

    if not raw:
        return None
    return json.loads(raw.decode("utf-8"))


def run_azure_devops_smoke_check(organization: str, project: str, pat: str) -> dict[str, Any]:
    """Validate authentication and config against the Azure DevOps API."""
    url = f"{base_url(organization, project)}/_apis/wit/fields/System.State?api-version=7.1"
    try:
        azdo_request("GET", url, pat)
        return {
            "status": "success",
            "message": "Azure DevOps authentication and connectivity validated successfully.",
        }
    except Exception as exc:
        raise SystemExit(
            "Failed to validate Azure DevOps connection/authentication.\n"
            f"Error: {exc}"
        )

def clean_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def detect_repository(repo_root: Path) -> str:
    git_config = repo_root / ".git" / "config"
    if not git_config.exists():
        raise SystemExit("Pass --repository; could not read .git/config.")

    content = git_config.read_text(encoding="utf-8", errors="ignore")
    urls = re.findall(r"^\s*url\s*=\s*(.+)$", content, flags=re.MULTILINE)
    for url in urls:
        match = re.search(r"/_git/([^/\s]+)", url)
        if match:
            return urllib.parse.unquote(match.group(1))
    for url in urls:
        cleaned = url.strip().rstrip("/")
        if cleaned.endswith(".git"):
            cleaned = cleaned[:-4]
        match = re.search(r"(?:[:/])([^/:]+)$", cleaned)
        if match:
            return urllib.parse.unquote(match.group(1))

    raise SystemExit("Pass --repository; Azure DevOps remote not found in .git/config.")


def normalize_thread(thread: dict[str, Any], include_system: bool) -> dict[str, Any] | None:
    comments = []
    for comment in thread.get("comments") or []:
        if comment.get("isDeleted"):
            continue
        comment_type = comment.get("commentType")
        if not include_system and comment_type == "system":
            continue
        content = clean_html(comment.get("content"))
        if not content:
            continue
        comments.append(
            {
                "id": comment.get("id"),
                "type": comment_type,
                "author": (comment.get("author") or {}).get("displayName"),
                "content": content,
                "publishedDate": comment.get("publishedDate"),
            }
        )

    if not comments:
        return None

    context = thread.get("threadContext") or {}
    pr_context = thread.get("pullRequestThreadContext") or {}
    right_start = context.get("rightFileStart") or {}
    right_end = context.get("rightFileEnd") or {}
    left_start = context.get("leftFileStart") or {}
    left_end = context.get("leftFileEnd") or {}

    return {
        "threadId": thread.get("id"),
        "status": thread.get("status"),
        "path": pr_context.get("filePath") or context.get("filePath"),
        "rightLine": right_start.get("line") or right_end.get("line"),
        "leftLine": left_start.get("line") or left_end.get("line"),
        "isDeleted": thread.get("isDeleted"),
        "comments": comments,
    }


def get_pr_context(repo_root: Path, pr_id: int, repository: str, include_system: bool) -> dict[str, Any]:
    organization, project, pat = load_azdo_config(repo_root)
    smoke = run_azure_devops_smoke_check(organization, project, pat)

    pr = azdo_request(
        "GET",
        git_url(organization, project, repository, f"pullRequests/{pr_id}?api-version=7.1"),
        pat,
    )
    threads_payload = azdo_request(
        "GET",
        git_url(organization, project, repository, f"pullRequests/{pr_id}/threads?api-version=7.1"),
        pat,
    )
    work_item_refs = azdo_request(
        "GET",
        git_url(organization, project, repository, f"pullRequests/{pr_id}/workitems?api-version=7.1"),
        pat,
    ).get("value", [])

    work_items = []
    ids = [str(item["id"]) for item in work_item_refs]
    if ids:
        items_url = (
            f"{base_url(organization, project)}/_apis/wit/workitems"
            f"?ids={','.join(ids)}&fields={urllib.parse.quote(DEFAULT_WORK_ITEM_FIELDS)}&api-version=7.1"
        )
        items_payload = azdo_request("GET", items_url, pat)
        for item in items_payload.get("value", []):
            fields = item.get("fields", {})
            work_items.append(
                {
                    "id": item.get("id"),
                    "type": fields.get("System.WorkItemType"),
                    "state": fields.get("System.State"),
                    "title": fields.get("System.Title"),
                    "description": clean_html(fields.get("System.Description")),
                    "acceptanceCriteria": clean_html(
                        fields.get("Microsoft.VSTS.Common.AcceptanceCriteria")
                    ),
                    "url": f"{base_url(organization, project)}/_workitems/edit/{item.get('id')}",
                }
            )

    threads = [normalize_thread(thread, include_system=include_system) for thread in threads_payload.get("value", [])]
    threads = [thread for thread in threads if thread is not None]
    active_threads = [
        thread
        for thread in threads
        if str(thread.get("status", "")).lower() in ACTIVE_STATUSES and thread.get("comments")
    ]

    return {
        "source": {
            "helper": str(Path(__file__).as_posix()),
            "azureDevOpsScript": None,
            "azureDevOpsScriptSmoke": smoke,
        },
        "organization": organization,
        "project": project,
        "repository": repository,
        "pullRequest": {
            "id": pr.get("pullRequestId"),
            "title": pr.get("title"),
            "status": pr.get("status"),
            "sourceRefName": pr.get("sourceRefName"),
            "targetRefName": pr.get("targetRefName"),
            "createdBy": (pr.get("createdBy") or {}).get("displayName"),
            "url": pr_web_url(pr),
        },
        "workItems": work_items,
        "threads": threads,
        "activeThreads": active_threads,
    }


MODEL_FOOTER_PREFIX = "LLM model:"


def format_resolution_comment(comment: str, model: str) -> str:
    body = comment.strip()
    model = (model or "").strip()
    if not model:
        return body
    if MODEL_FOOTER_PREFIX.lower() in body.lower():
        return body
    return f"{body}\n\n---\n{MODEL_FOOTER_PREFIX} {model}"


def resolve_thread(
    repo_root: Path,
    pr_id: int,
    repository: str,
    thread_id: int,
    comment: str,
    model: str,
    dry_run: bool,
) -> dict[str, Any]:
    formatted_comment = format_resolution_comment(comment, model)
    if dry_run:
        return {
            "dryRun": True,
            "threadId": thread_id,
            "status": "would_mark_fixed",
            "commentId": None,
            "comment": formatted_comment,
            "model": model,
            "message": "Dry-run: no comment was posted and the thread was not changed in Azure DevOps.",
        }

    organization, project, pat = load_azdo_config(repo_root)
    run_azure_devops_smoke_check(organization, project, pat)

    comments_suffix = f"pullRequests/{pr_id}/threads/{thread_id}/comments?api-version=7.1"
    patch_suffix = f"pullRequests/{pr_id}/threads/{thread_id}?api-version=7.1"

    posted = azdo_request(
        "POST",
        git_url(organization, project, repository, comments_suffix),
        pat,
        body={"content": formatted_comment, "commentType": 1},
    )
    patched = azdo_request(
        "PATCH",
        git_url(organization, project, repository, patch_suffix),
        pat,
        body={"status": "fixed"},
    )

    return {
        "threadId": thread_id,
        "status": patched.get("status") if patched else "fixed",
        "commentId": posted.get("id") if posted else None,
        "model": model,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    common_parser = argparse.ArgumentParser(add_help=False)
    common_parser.add_argument(
        "--repo-root",
        default=argparse.SUPPRESS,
        help="Repository root. Default: autodetect.",
    )
    common_parser.add_argument(
        "--repository",
        default=argparse.SUPPRESS,
        help="Azure DevOps repository name. Default: autodetect.",
    )

    parser = argparse.ArgumentParser(
        description="Azure DevOps helper for fix-pr.",
        parents=[common_parser],
    )
    sub = parser.add_subparsers(dest="action", required=True)

    collect = sub.add_parser(
        "collect",
        help="Collect PR, threads, comments, and work items.",
        parents=[common_parser],
    )
    collect.add_argument("--pr-id", type=int, required=True)
    collect.add_argument("--include-system", action="store_true")
    collect.add_argument("--output", default="", help="Output JSON file. Default: stdout.")

    resolve = sub.add_parser(
        "resolve-thread",
        help="Comment and mark a thread as fixed.",
        parents=[common_parser],
    )
    resolve.add_argument("--pr-id", type=int, required=True)
    resolve.add_argument("--thread-id", type=int, required=True)
    resolve.add_argument("--comment", required=True)
    resolve.add_argument(
        "--model",
        default="",
        help="Optional session model id for the resolution footer (host metadata, not a new intent).",
    )
    resolve.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate resolution locally without posting a comment or changing status in Azure DevOps.",
    )

    args = parser.parse_args(argv)
    if not hasattr(args, "repo_root"):
        args.repo_root = ""
    if not hasattr(args, "repository"):
        args.repository = ""
    return args


def print_collect_summary(payload: dict[str, Any]) -> None:
    """Print counts to stderr so agents need not re-open UTF-8 JSON with locale encoding."""
    threads = payload.get("threads") or []
    active = payload.get("activeThreads") or []
    statuses: dict[str, int] = {}
    for thread in threads:
        status = thread.get("status")
        key = str(status) if status is not None else "null"
        statuses[key] = statuses.get(key, 0) + 1
    summary = {
        "threads": len(threads),
        "activeThreads": len(active),
        "statuses": statuses,
        "topKeys": sorted(payload.keys()),
    }
    print(f"collect-summary: {json.dumps(summary, ensure_ascii=False)}", file=sys.stderr)


def main(argv: list[str]) -> int:
    ensure_utf8_stdio()
    args = parse_args(argv)
    repo_root = find_repo_root(Path(args.repo_root) if args.repo_root else Path.cwd())
    if args.action == "resolve-thread" and args.dry_run:
        repository = args.repository or "dry-run"
    else:
        repository = args.repository or detect_repository(repo_root)

    if args.action == "collect":
        payload = get_pr_context(repo_root, args.pr_id, repository, include_system=args.include_system)
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        if args.output:
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(text + "\n", encoding="utf-8")
        else:
            print(text)
        print_collect_summary(payload)
        return 0

    if args.action == "resolve-thread":
        payload = resolve_thread(
            repo_root,
            args.pr_id,
            repository,
            args.thread_id,
            args.comment,
            args.model,
            dry_run=args.dry_run,
        )
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    raise SystemExit(f"Unknown action: {args.action}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
