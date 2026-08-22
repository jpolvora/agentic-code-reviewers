#!/usr/bin/env bash
# pre-commit.sh — Secrets leak check for git pre-commit hook
# Install: ln -s ../../.agents/skills/ws-secrets-leak-review/scripts/pre-commit.sh .git/hooks/pre-commit
# Or: bash .agents/skills/ws-secrets-leak-review/scripts/install-hook.sh
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || exit 1)
cd "$REPO_ROOT"

# Resolve the scanner at run time: project-local install first, then global
# (WORKFLOW_SKILLS_GLOBAL_DIR / $HOME/.agents/skills) so hybrid installs work and
# a skill folder rename cannot leave the hook silently pointing at a dead path.
SCANNER=""
for skills_root in \
  "$REPO_ROOT/.agents/skills" \
  "${WORKFLOW_SKILLS_GLOBAL_DIR:-}" \
  "${HOME:-/nonexistent}/.agents/skills"; do
  [ -n "$skills_root" ] || continue
  skills_root="${skills_root//\\//}"
  candidate="$skills_root/ws-secrets-leak-review/scripts/secrets_scanner.sh"
  if [ -f "$candidate" ]; then
    SCANNER="$candidate"
    break
  elif command -v wslpath &>/dev/null; then
    wsl_cand=$(wslpath -u "$candidate" 2>/dev/null || true)
    if [ -n "$wsl_cand" ] && [ -f "$wsl_cand" ]; then
      SCANNER="$wsl_cand"
      break
    fi
  fi
done

# Only scan staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

if [ -z "$SCANNER" ]; then
  echo -e "${YELLOW}[secrets-leak] ws-secrets-leak-review not found in project or global skills root — skipping${NC}"
  exit 0
fi

if ! command -v rg &>/dev/null; then
  echo -e "${YELLOW}[secrets-leak] ripgrep (rg) not on PATH — commit NOT scanned${NC}"
  exit 0
fi

# Staged-only + hard cap so the hook always finishes
export GIT_STAGED_ONLY=1
export SECRETS_SCAN_MAX_HITS="${SECRETS_SCAN_MAX_HITS:-30}"

# Capture scanner output. A crashed scanner must not read as a clean scan.
SCAN_STATUS=0
SCAN_OUTPUT=$(bash "$SCANNER" 2>&1) || SCAN_STATUS=$?
if [ "$SCAN_STATUS" -ne 0 ]; then
  echo -e "${RED}[secrets-leak] Scanner failed (exit $SCAN_STATUS) — commit blocked:${NC}" >&2
  echo "$SCAN_OUTPUT" >&2
  exit 1
fi

# Check for HIGH findings
if echo "$SCAN_OUTPUT" | rg -q 'HIGH.*must fix'; then
  echo ""
  echo -e "${RED}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║       SECRETS LEAK DETECTED — COMMIT BLOCKED    ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "$SCAN_OUTPUT"
  echo ""
  echo -e "${RED}Fix HIGH findings above, or use --no-verify to override.${NC}"
  exit 1
fi

# Warn on MEDIUM
if echo "$SCAN_OUTPUT" | rg -q 'MEDIUM'; then
  echo ""
  echo -e "${YELLOW}[secrets-leak] Medium-severity findings detected:${NC}"
  echo "$SCAN_OUTPUT" | rg 'MEDIUM' -A 10 || true
  echo ""
  echo -e "${YELLOW}Review recommended. Commit proceeding.${NC}"
fi

exit 0
