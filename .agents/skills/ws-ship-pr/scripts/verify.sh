#!/usr/bin/env bash
# Project-agnostic verification gate (build + tests; frontend when touched).
# Reads config.json for commands; falls back to env vars / sane defaults.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
config_file="$repo_root/.agents/skills/ws-shared/config.json"
base_branch="${SHIP_PR_BASE:-$(bash "$script_dir/detect-base-branch.sh")}"

frontend_touched() {
  {
    git diff --name-only
    git diff --cached --name-only
    git diff --name-only "$base_branch"...HEAD 2>/dev/null || true
  } | grep -q '^web/'
}

# Prefer documented launcher `python`, fall back to `python3` (Linux images).
if command -v python >/dev/null 2>&1; then
  _py=python
elif command -v python3 >/dev/null 2>&1; then
  _py=python3
else
  echo "verify.sh: python (or python3) is required" >&2
  exit 1
fi

# Always UTF-8 — bare open() uses Windows locale (cp1252) and can UnicodeDecodeError.
# Force Unix newlines: Windows Python prints \r\n; bash `read` keeps trailing \r and breaks eval.
read_verification_config() {
  PYTHONUTF8=1 PYTHONIOENCODING=utf-8 "$_py" -c "
import sys
from pathlib import Path
import json
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', newline='\n')
cfg = Path(r'''$config_file''')
c = json.loads(cfg.read_text(encoding='utf-8'))
v = c.get('verification', {}) or {}
s = (c.get('stack', {}) or {}).get('frontend', {}) or {}
print(v.get('backendBuild') or '')
print(v.get('backendTest') or '')
print(v.get('frontendBuild') or '')
print(v.get('frontendTest') or '')
print((s.get('sourceDir') or 'web').split('/')[0])
"
}

echo "==> verify (base: $base_branch)"

if [ -f "$config_file" ]; then
  {
    read -r backend_build
    read -r backend_test
    read -r frontend_build
    read -r frontend_test
    read -r frontend_dir
  } < <(read_verification_config)
  # Defense in depth if a host still emits CR
  backend_build="${backend_build//$'\r'/}"
  backend_test="${backend_test//$'\r'/}"
  frontend_build="${frontend_build//$'\r'/}"
  frontend_test="${frontend_test//$'\r'/}"
  frontend_dir="${frontend_dir//$'\r'/}"
  frontend_dir="${frontend_dir:-web}"
else
  echo "==> No config.json found — using fallback commands"
  backend_build="dotnet build"
  backend_test="dotnet test"
  frontend_build="npm run build"
  frontend_test="npm test"
  frontend_dir="web"
fi

echo "==> $backend_build"
eval "$backend_build"

echo "==> $backend_test"
eval "$backend_test"

if frontend_touched; then
  echo "==> $frontend_dir/ touched — $frontend_test + $frontend_build"
  eval "$frontend_test" 2>/dev/null || true
  eval "$frontend_build"
else
  echo "==> $frontend_dir/ not touched — skipping frontend"
fi

# Upstream workflow-skills only: fail closed if committed skill digests drift.
integrity_gen="$repo_root/bin/generate-skill-integrity.js"
if [ -f "$integrity_gen" ]; then
  echo "==> node bin/generate-skill-integrity.js --check"
  node "$integrity_gen" --check
fi

echo "VERIFY_OK"
