#!/usr/bin/env python3
"""
Infer billable human work duration, agent running time, idle gaps,
and human activity breakdown for ws-activity-report.

Human Total includes concurrent supervision during agent runs and must be
>= Agent Running Total when agent running time is positive.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Idle gap threshold (seconds): gaps longer than 30 minutes of no activity are classified as idle/AFK.
IDLE_GAP_THRESHOLD = 30 * 60

# Max continuous human active session window per interaction burst (seconds)
MAX_HUMAN_BURST = 45 * 60

def parse_iso(dt_str: str | None) -> datetime | None:
    if not dt_str:
        return None
    raw = dt_str.strip().strip('"').strip("'").replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None

def format_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def format_duration(seconds: float) -> str:
    total_min = int(round(seconds / 60.0))
    hours = total_min // 60
    minutes = total_min % 60
    return f"{hours}:{minutes:02d}"

def get_file_ctime(path: Path) -> datetime | None:
    try:
        st = path.stat()
    except OSError:
        return None
    if os.name == "nt":
        ts = float(st.st_ctime)
    else:
        ts = float(getattr(st, "st_birthtime", st.st_ctime))
    return datetime.fromtimestamp(ts, tz=timezone.utc)

def get_git_commits(us_dir: Path) -> list[dict]:
    commits: list[dict] = []
    # Find git root from us_dir
    git_root = us_dir.resolve()
    while git_root.parent != git_root and not (git_root / ".git").exists():
        git_root = git_root.parent
    if not (git_root / ".git").exists():
        return commits

    rel_us_dir = us_dir.resolve().relative_to(git_root).as_posix()
    try:
        res = subprocess.run(
            [
                "git",
                "log",
                "--format=%H|%an|%ae|%aI|%cI|%s",
                "--name-only",
                "--",
                rel_us_dir,
            ],
            cwd=str(git_root),
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            return commits

        blocks = res.stdout.strip().split("\n\n")
        for block in blocks:
            lines = [l.strip() for l in block.split("\n") if l.strip()]
            if not lines:
                continue
            parts = lines[0].split("|", 5)
            if len(parts) < 6:
                continue
            sha, author_name, author_email, author_date, commit_date, subject = parts
            files = lines[1:]
            dt = parse_iso(author_date) or parse_iso(commit_date)
            if dt:
                is_bot = any(
                    b in author_name.lower() or b in author_email.lower()
                    for b in ("bot", "agent", "github-actions", "copilot")
                )
                commits.append(
                    {
                        "sha": sha,
                        "author": author_name,
                        "email": author_email,
                        "date": dt,
                        "subject": subject,
                        "files": files,
                        "isBot": is_bot,
                    }
                )
    except OSError:
        pass
    return commits

def scan_transcript_events(transcript_path: Path) -> list[dict]:
    events: list[dict] = []
    if not transcript_path.is_file():
        return events
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                    stype = obj.get("type") or obj.get("source")
                    timestamp = obj.get("timestamp") or obj.get("created_at")
                    dt = parse_iso(timestamp) if timestamp else None
                    if dt:
                        events.append({"type": stype, "date": dt, "raw": obj})
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return events

def scan_state_timestamps(us_dir: Path) -> list[dict]:
    events: list[dict] = []
    state_files = sorted(us_dir.glob("*.state.md")) + sorted(us_dir.glob("*.archive/*.state.md"))
    for state_file in state_files:
        try:
            text = state_file.read_text(encoding="utf-8")
        except OSError:
            continue
        # Extract startedAt, endedAt, updatedAt
        for match in re.finditer(r"^(startedAt|endedAt|updatedAt):\s*[\"']?([^\"'\n#]+)", text, re.M | re.I):
            key, val = match.group(1), match.group(2).strip().strip('"').strip("'")
            dt = parse_iso(val)
            if dt:
                events.append({"key": key, "date": dt, "file": state_file.name})
        # Extract timestamp log entries if present
        for match in re.finditer(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", text):
            dt = parse_iso(match.group(0))
            if dt:
                events.append({"key": "log_entry", "date": dt, "file": state_file.name})
    return events

def infer_timing(us_dir: Path, bootstrap_start_iso: str | None = None, end_override_iso: str | None = None) -> dict:
    data_sources: list[str] = []
    all_events: list[dict] = []

    # Source 1: Bootstrap start & state file timestamps
    state_events = scan_state_timestamps(us_dir)
    if state_events:
        data_sources.append("workflow_state")
        for se in state_events:
            all_events.append({"source": "workflow_state", "kind": se["key"], "date": se["date"]})

    # Source 2: Local file creation/modification times for spec/plan/code
    for path in sorted(us_dir.rglob("*")):
        if path.is_file() and not path.name.startswith("."):
            ctime = get_file_ctime(path)
            if ctime:
                is_spec_plan = any(kw in path.name.lower() for kw in ("spec", "plan", "state", "issue"))
                kind = "edit_spec_plan" if is_spec_plan else "file_modification"
                all_events.append({"source": "local_files", "kind": kind, "date": ctime, "file": path.name})
    if us_dir.exists():
        data_sources.append("local_files")

    # Source 3: Git commits
    commits = get_git_commits(us_dir)
    if commits:
        data_sources.append("git_log")
        for c in commits:
            kind = "agent_commit" if c["isBot"] else "human_commit"
            is_spec_plan = any("spec" in f.lower() or "plan" in f.lower() for f in c["files"])
            if not c["isBot"] and is_spec_plan:
                kind = "human_spec_edit"
            all_events.append({"source": "git_log", "kind": kind, "date": c["date"], "author": c["author"]})

    # Source 4: Transcript telemetry if available in .runtime or parent brain
    transcript_paths = list(us_dir.glob(".runtime/*.jsonl")) + list(us_dir.glob("*.jsonl"))
    for tp in transcript_paths:
        t_events = scan_transcript_events(tp)
        if t_events:
            data_sources.append("transcripts")
            for te in t_events:
                kind = "human_prompt" if te["type"] in ("USER_INPUT", "user") else "agent_tool"
                all_events.append({"source": "transcripts", "kind": kind, "date": te["date"]})

    # Sort all timestamps
    all_events.sort(key=lambda x: x["date"])

    # Determine start and end timestamps
    start_dt = parse_iso(bootstrap_start_iso)
    if not start_dt and all_events:
        start_dt = all_events[0]["date"]
    elif not start_dt:
        start_dt = datetime.now(timezone.utc)

    end_dt = parse_iso(end_override_iso)
    if not end_dt and all_events:
        end_dt = all_events[-1]["date"]
    elif not end_dt:
        end_dt = start_dt

    if end_dt < start_dt:
        end_dt = start_dt

    wall_clock_seconds = (end_dt - start_dt).total_seconds()

    # Segment timeline: idle, agent-running (concurrent human supervision), exclusive human work.
    reviewing_deciding_sec = 0.0
    editing_specs_sec = 0.0
    prompting_sec = 0.0
    agent_running_sec = 0.0
    idle_sec = 0.0

    def _is_agent_kind(kind: str) -> bool:
        return "agent" in kind or kind in ("log_entry", "updatedAt")

    def _allocate_active_interval(delta: float, preceding_kind: str) -> None:
        nonlocal reviewing_deciding_sec, editing_specs_sec, prompting_sec, agent_running_sec
        if _is_agent_kind(preceding_kind):
            agent_running_sec += delta
            # Agent runs are concurrent human supervision / review (billable).
            reviewing_deciding_sec += delta
        elif preceding_kind in ("human_spec_edit", "edit_spec_plan"):
            editing_specs_sec += delta
        elif preceding_kind == "human_prompt":
            prompting_sec += delta
        else:
            reviewing_deciding_sec += delta

    if not all_events or wall_clock_seconds <= 0:
        # No telemetry: do not fabricate billable time (TIMING.md Idle / AFK Gaps).
        # Report the wall span as idle/unknown instead of inventing 55/25/20 splits.
        agent_running_sec = 0.0
        reviewing_deciding_sec = 0.0
        editing_specs_sec = 0.0
        prompting_sec = 0.0
        idle_sec = max(0.0, wall_clock_seconds)
    else:
        current_time = start_dt
        last_kind = "reviewing_deciding"

        for ev in all_events:
            ev_dt = ev["date"]
            if ev_dt < start_dt or ev_dt > end_dt:
                continue

            delta = (ev_dt - current_time).total_seconds()
            if delta > 0:
                if delta >= IDLE_GAP_THRESHOLD:
                    idle_sec += delta
                else:
                    _allocate_active_interval(delta, last_kind)
            current_time = ev_dt
            last_kind = ev.get("kind", last_kind)

        tail_delta = (end_dt - current_time).total_seconds()
        if tail_delta > 0:
            if tail_delta >= IDLE_GAP_THRESHOLD:
                idle_sec += tail_delta
            else:
                _allocate_active_interval(tail_delta, last_kind)

    total_human_sec = reviewing_deciding_sec + editing_specs_sec + prompting_sec

    # Fill unallocated active wall time into reviewing/deciding (exclusive human work).
    allocated_active = total_human_sec + idle_sec
    if allocated_active < wall_clock_seconds:
        diff = wall_clock_seconds - allocated_active
        reviewing_deciding_sec += diff
        total_human_sec += diff

    # Invariant: billable human time covers agent running (supervision model).
    if agent_running_sec > 0 and total_human_sec < agent_running_sec:
        diff = agent_running_sec - total_human_sec
        reviewing_deciding_sec += diff
        total_human_sec += diff

    # Determine main human activity
    activities = [
        ("Reviewing & Deciding", reviewing_deciding_sec),
        ("Editing Specs & Plans", editing_specs_sec),
        ("Prompting & Iterating", prompting_sec),
    ]
    main_activity = max(activities, key=lambda x: x[1])[0]

    return {
        "ok": True,
        "usDir": str(us_dir),
        "startIso": format_iso(start_dt),
        "endIso": format_iso(end_dt),
        "wallClockSeconds": round(wall_clock_seconds, 1),
        "wallClockFormatted": format_duration(wall_clock_seconds),
        "humanSeconds": round(total_human_sec, 1),
        "humanFormatted": format_duration(total_human_sec),
        "humanBreakdown": {
            "reviewingDecidingSeconds": round(reviewing_deciding_sec, 1),
            "reviewingDecidingFormatted": format_duration(reviewing_deciding_sec),
            "editingSpecsPlansSeconds": round(editing_specs_sec, 1),
            "editingSpecsPlansFormatted": format_duration(editing_specs_sec),
            "promptingSeconds": round(prompting_sec, 1),
            "promptingFormatted": format_duration(prompting_sec),
        },
        "agentRunningSeconds": round(agent_running_sec, 1),
        "agentRunningFormatted": format_duration(agent_running_sec),
        "idleSeconds": round(idle_sec, 1),
        "idleFormatted": format_duration(idle_sec),
        "mainHumanActivity": main_activity,
        "dataSources": sorted(list(set(data_sources))),
    }

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Infer active human work duration and agent wait time for a plan folder"
    )
    parser.add_argument("us_dir", help="Path to {us-dir} under plans.dir")
    parser.add_argument("--start-iso", help="Optional override start ISO string")
    parser.add_argument("--end-iso", help="Optional override end ISO string")
    parser.add_argument("--json", action="store_true", default=True, help="Emit JSON")
    args = parser.parse_args()

    us_dir = Path(args.us_dir).resolve()
    if not us_dir.is_dir():
        print(
            json.dumps({"ok": False, "error": "not-a-directory", "usDir": str(us_dir)}),
            flush=True,
        )
        return 1

    result = infer_timing(us_dir, bootstrap_start_iso=args.start_iso, end_override_iso=args.end_iso)
    print(json.dumps(result, ensure_ascii=True), flush=True)
    return 0 if result.get("ok") else 2

if __name__ == "__main__":
    sys.exit(main())
