#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Agentic Code Reviewers — Remote Runner
# ──────────────────────────────────────────────────────────────────────
# Clona a branch 'release', instala dependências de runtime e executa o
# reviewer no diretório atual (repo alvo). Suporta seleção de engine.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_URL="${AGENTIC_CODE_REVIEWERS_REPO_URL:-${CURSOR_REVIEWER_REPO_URL:-https://github.com/jpolvora/agentic-code-reviewers.git}}"
TEMP_DIR=".tmp-agentic-code-reviewers"
CALLER_DIR="$(pwd)"
ENGINE_RAW="${AGENTIC_CODE_REVIEWERS_ENGINE:-${CURSOR_REVIEWER_ENGINE:-cursor-sdk}}"
FORWARD_ARGS=()

usage() {
  cat <<'EOF'
Uso: run.sh [opções do runner] [-- opções repassadas]

Seleciona a engine LLM e executa o Agentic Code Reviewers no diretório atual
(repositório ou pasta alvo) via clone remoto da branch release.

Opções do runner:
  --engine ENGINE   Engine: cursor, cursor-sdk (padrão) ou opencode
  -e ENGINE         Atalho para --engine
  --help, -h        Exibe esta ajuda

Demais argumentos são repassados ao reviewer, por exemplo:
  --dry-run
  --stack typescript
  --target-branch refs/heads/main
  --gh --pr-id 42

Variáveis de ambiente:
  AGENTIC_CODE_REVIEWERS_ENGINE     Mesmo que --engine
  AGENTIC_CODE_REVIEWERS_REPO_URL   URL do repositório (default: agentic-code-reviewers)
  (legado: CURSOR_REVIEWER_ENGINE, CURSOR_REVIEWER_REPO_URL)

Exemplos:
  curl -fsSL .../run.sh | bash -s -- --dry-run
  curl -fsSL .../run.sh | bash -s -- --engine opencode --dry-run
  curl -fsSL .../run.sh | bash -s -- -e cursor --dry-run --stack typescript
EOF
}

normalize_engine() {
  case "${1,,}" in
    cursor | cursor-sdk)
      echo "cursor-sdk"
      ;;
    opencode)
      echo "opencode"
      ;;
    *)
      echo "Engine inválida: '$1'. Valores aceitos: cursor, cursor-sdk, opencode." >&2
      exit 1
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --engine)
      if [[ $# -lt 2 ]]; then
        echo "Erro: --engine requer um valor (cursor ou opencode)." >&2
        exit 1
      fi
      ENGINE_RAW="$2"
      shift 2
      ;;
    --engine=*)
      ENGINE_RAW="${1#*=}"
      shift
      ;;
    -e)
      if [[ $# -lt 2 ]]; then
        echo "Erro: -e requer um valor (cursor ou opencode)." >&2
        exit 1
      fi
      ENGINE_RAW="$2"
      shift 2
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      FORWARD_ARGS+=("$1")
      shift
      ;;
  esac
done

AGENTIC_CODE_REVIEWERS_ENGINE="$(normalize_engine "$ENGINE_RAW")"
export AGENTIC_CODE_REVIEWERS_ENGINE

echo "=== [Runner] Iniciando execução remota do Agentic Code Reviewers ==="
echo "Repositório do Reviewer: $REPO_URL"
echo "Diretório Alvo da Análise: $CALLER_DIR"
echo "Engine: $AGENTIC_CODE_REVIEWERS_ENGINE"

if [[ "$AGENTIC_CODE_REVIEWERS_ENGINE" == "opencode" ]] && ! command -v opencode >/dev/null 2>&1; then
  echo "AVISO: engine opencode requer o CLI 'opencode' instalado (https://opencode.ai/install)" >&2
fi

cleanup() {
  if [ -d "$CALLER_DIR/$TEMP_DIR" ]; then
    echo "=== [Runner] Limpando diretório temporário ==="
    rm -rf "$CALLER_DIR/$TEMP_DIR"
  fi
}
trap cleanup EXIT

rm -rf "$CALLER_DIR/$TEMP_DIR"

echo "=== [Runner] Baixando artefatos compilados (branch release) ==="
git clone --depth 1 --branch release "$REPO_URL" "$CALLER_DIR/$TEMP_DIR"

echo "=== [Runner] Instalando dependências de runtime ==="
cd "$CALLER_DIR/$TEMP_DIR"
npm ci --omit=dev

VERSION=$(node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); console.log(pkg.version);")
echo "=== [Runner] Executando Agentic Code Reviewers v$VERSION (engine: $AGENTIC_CODE_REVIEWERS_ENGINE) ==="
node dist/index.js --repo-root "$CALLER_DIR" "${FORWARD_ARGS[@]}"
