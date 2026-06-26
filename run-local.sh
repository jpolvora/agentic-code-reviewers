#!/usr/bin/env bash
# Teste local rápido — dry-run sem publicar na PR
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
assert_required_skill() {
  local relative_path="$1"
  local skill_path="$SCRIPT_DIR/$relative_path"
  if [[ ! -f "$skill_path" ]]; then
    echo "❌ [cursor-reviewer] Skill/Prompt obrigatória ausente: $relative_path" >&2
    echo "   Runner: $SCRIPT_DIR" >&2
    echo "   Garanta que a skill está em skills/ antes de executar." >&2
    exit 1
  fi
}

assert_required_skill "skills/CODE_REVIEW.md"
assert_required_skill "skills/SYSTEM_PROMPT.md"

cd "$SCRIPT_DIR"

has_cursor_api_key() {
  [[ -n "${CURSOR_API_KEY:-}" ]] || grep -Eq '^[[:space:]]*CURSOR_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$SCRIPT_DIR/.env" 2>/dev/null
}

if ! has_cursor_api_key; then
  echo "Defina CURSOR_API_KEY antes de executar."
  echo "  export CURSOR_API_KEY=cursor_..."
  echo "  ou configure scripts/cursor-reviewer/.env"
  exit 1
fi

normalize_ref() {
  local ref="$1"
  if [[ "$ref" != refs/heads/* && "$ref" != refs/remotes/* ]]; then
    ref="refs/heads/$ref"
  fi
  printf '%s' "$ref"
}

TARGET_BRANCH="${2:-${CURSOR_REVIEWER_TARGET_BRANCH:-refs/heads/master}}"
TARGET_BRANCH="$(normalize_ref "$TARGET_BRANCH")"

is_ci_environment() {
  [[ -n "${TF_BUILD:-}" || "${CI:-}" == "true" || -n "${AGENT_ID:-}" || -n "${SYSTEM_TEAMFOUNDATIONCOLLECTIONURI:-}" ]]
}

pick_source_branch_interactive() {
  local -a branches=()
  local branch count max_index choice

  mapfile -t branches < <(
    git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short)' | head -10
  )

  count="${#branches[@]}"
  if [[ "$count" -eq 0 ]]; then
    echo "Nenhuma branch local encontrada." >&2
    exit 1
  fi

  max_index=$((count - 1))
  echo "Branch target: $TARGET_BRANCH" >&2
  echo "Selecione a branch source (10 mais recentes):" >&2
  for i in "${!branches[@]}"; do
    printf '  %d) %s\n' "$i" "${branches[$i]}" >&2
  done

  while true; do
    read -rp "Escolha [0-${max_index}]: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 0 && choice <= max_index )); then
      branch="${branches[$choice]}"
      printf 'refs/heads/%s' "$branch"
      return 0
    fi
    echo "Entrada inválida. Informe um número de 0 a ${max_index}." >&2
  done
}

if [[ -n "${1:-}" ]]; then
  SOURCE_BRANCH="$(normalize_ref "$1")"
elif is_ci_environment; then
  echo "Em CI/Azure Pipelines é obrigatório informar a branch source como 1º argumento." >&2
  echo "  ./run-local.sh refs/heads/minha-feature [target-branch]" >&2
  echo "Na pipeline de produção use npm run review com --source-branch (ver README)." >&2
  exit 1
elif [[ ! -t 0 ]]; then
  echo "Branch source não informada e terminal não interativo (stdin sem TTY)." >&2
  echo "  ./run-local.sh refs/heads/minha-feature [target-branch]" >&2
  exit 1
else
  SOURCE_BRANCH="$(pick_source_branch_interactive)"
fi

echo "Dry-run: $SOURCE_BRANCH -> $TARGET_BRANCH"
npm run review -- \
  --dry-run \
  --source-branch "$SOURCE_BRANCH" \
  --target-branch "$TARGET_BRANCH" \
  "${@:3}"
