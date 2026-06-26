#!/usr/bin/env bash
# Instala fixtures → dry-run (se CURSOR_API_KEY) → avalia → remove seeds
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

assert_required_skill() {
  local relative_path="$1"
  local skill_path="$SCRIPT_DIR/$relative_path"
  if [[ ! -f "$skill_path" ]]; then
    echo "❌ [cursor-reviewer] Skill/Prompt obrigatória ausente: $relative_path" >&2
    echo "   Runner: $SCRIPT_DIR" >&2
    exit 1
  fi
}

assert_required_skill "skills/CODE_REVIEW.md"
assert_required_skill "skills/SYSTEM_PROMPT.md"

cd "$SCRIPT_DIR"
npm run test:seed -- "$@"
