#!/usr/bin/env python3
"""Compatibility shim — forwards to ws-github-provider canonical script."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

_TARGET = (
    Path(__file__).resolve().parents[2]
    / "ws-github-provider"
    / "scripts"
    / "github-issue-to-spec.py"
)
raise SystemExit(subprocess.call([sys.executable, str(_TARGET), *sys.argv[1:]]))
