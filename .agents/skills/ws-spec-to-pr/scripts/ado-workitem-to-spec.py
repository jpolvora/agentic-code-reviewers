#!/usr/bin/env python3
"""Thin shim — forwards to ws-azure-devops-provider canonical script."""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

_TARGET = (
    Path(__file__).resolve().parents[2]
    / "ws-azure-devops-provider"
    / "scripts"
    / "ado-workitem-to-spec.py"
)

if not _TARGET.is_file():
    raise SystemExit(f"Canonical script not found: {_TARGET}")

sys.argv[0] = str(_TARGET)
runpy.run_path(str(_TARGET), run_name="__main__")
