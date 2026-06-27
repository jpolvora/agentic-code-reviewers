#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Agentic Code Reviewers — Runner
# ──────────────────────────────────────────────────────────────────────
# Modo remoto (padrão): clona branch release e revisa o diretório atual.
# Modo local (--local): usa o checkout atual (CI, dev no próprio repo).
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CALLER_DIR="$(pwd)"
REPO_URL="${AGENTIC_CODE_REVIEWERS_REPO_URL:-https://github.com/jpolvora/agentic-code-reviewers.git}"
RELEASE_BRANCH="${AGENTIC_CODE_REVIEWERS_RELEASE_BRANCH:-release}"
TEMP_DIR=".tmp-agentic-code-reviewers"
ENGINE_RAW="${AGENTIC_CODE_REVIEWERS_ENGINE:-cursor-sdk}"
LOCAL_MODE="${AGENTIC_CODE_REVIEWERS_LOCAL:-false}"
FORWARD_ARGS=()

default_runner_script_url() {
  local repo_path="${REPO_URL%.git}"
  repo_path="${repo_path#https://github.com/}"
  repo_path="${repo_path#git@github.com:}"
  echo "https://raw.githubusercontent.com/${repo_path}/${RELEASE_BRANCH}/run.sh"
}

usage() {
  cat <<'EOF'
Uso: run.sh [opções do runner] [-- opções repassadas]

Executa o Agentic Code Reviewers no diretório atual (repositório ou pasta alvo).

Opções do runner:
  --local           Usa o checkout atual (CI / dev). Não clona branch release.
  --engine ENGINE   Engine: cursor, cursor-sdk (padrão) ou opencode
  -e ENGINE         Atalho para --engine
  --help, -h        Exibe esta ajuda

Demais argumentos são repassados ao reviewer, por exemplo:
  --dry-run
  --stack typescript
  --target-branch refs/heads/main
  --gh --pr-id 42

Variáveis de ambiente:
  AGENTIC_CODE_REVIEWERS_LOCAL=1       Mesmo que --local
  AGENTIC_CODE_REVIEWERS_ENGINE        Mesmo que --engine
  AGENTIC_CODE_REVIEWERS_USE_TSX=true  Força npx tsx src/index.ts (default em --local)
  AGENTIC_CODE_REVIEWERS_REPO_URL      URL git do reviewer (modo remoto)
  AGENTIC_CODE_REVIEWERS_RELEASE_BRANCH Branch dos artefatos (default: release)
  OPENCODE_API_KEY                      Credencial OpenCode Go

Modo remoto em outro projeto (CI):
  curl -fsSL https://raw.githubusercontent.com/OWNER/agentic-code-reviewers/release/run.sh | bash -s -- \\
    --gh --pr-id 42 --source-branch feat/x --target-branch main

Ou use o reusable workflow:
  uses: OWNER/agentic-code-reviewers/.github/workflows/review-remote.yml@release

Exemplos:
  bash run.sh --local --gh --pr-id 42
  bash run.sh --local --engine opencode --dry-run
  curl -fsSL .../release/run.sh | bash -s -- --dry-run
  curl -fsSL .../release/run.sh | bash -s -- --engine opencode --dry-run
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

is_truthy() {
  case "${1,,}" in
    1 | true | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_prerequisites() {
  if ! command -v git >/dev/null 2>&1; then
    echo "Erro: git não encontrado no PATH." >&2
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "Erro: npm não encontrado no PATH." >&2
    exit 1
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "Erro: Node.js não encontrado. Requerido >= 22.13." >&2
    exit 1
  fi

  local version major minor
  version="$(node -v | sed 's/^v//')"
  IFS=. read -r major minor _ <<<"$version"
  if (( major < 22 || (major == 22 && minor < 13) )); then
    echo "Erro: Node.js v$version insuficiente. Requerido >= 22.13." >&2
    exit 1
  fi
}

prepare_opencode() {
  if [[ "$AGENTIC_CODE_REVIEWERS_ENGINE" != "opencode" ]]; then
    return 0
  fi

  local api_key="${OPENCODE_API_KEY:-}"

  if ! command -v opencode >/dev/null 2>&1; then
    echo "=== [Runner] Instalando OpenCode CLI ==="
    curl -fsSL https://opencode.ai/install | bash
  fi

  # GITHUB_PATH só vale no próximo step do Actions; garantir PATH nesta sessão.
  if [[ -d "${HOME}/.opencode/bin" ]]; then
    export PATH="${HOME}/.opencode/bin:${PATH}"
  fi

  if ! command -v opencode >/dev/null 2>&1; then
    echo "Erro: CLI opencode não encontrado após instalação (esperado em ${HOME}/.opencode/bin)." >&2
    exit 1
  fi

  if [[ -n "$api_key" ]]; then
    echo "=== [Runner] Configurando credenciais OpenCode Go ==="
    mkdir -p "${HOME}/.local/share/opencode"
    OPENCODE_API_KEY="$api_key" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const authPath = path.join(process.env.HOME, '.local/share/opencode/auth.json');
const auth = {
  'opencode-go': { type: 'api', key: process.env.OPENCODE_API_KEY },
};
fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
NODE
  elif [[ ! -f "${HOME}/.local/share/opencode/auth.json" ]]; then
    echo "AVISO: credenciais OpenCode ausentes (defina OPENCODE_API_KEY ou ~/.local/share/opencode/auth.json)" >&2
  fi
}

resolve_runner_cmd() {
  local reviewer_root="$1"

  if is_truthy "${AGENTIC_CODE_REVIEWERS_USE_TSX:-}" || [[ "$LOCAL_MODE" == "true" && -f "$reviewer_root/src/index.ts" ]]; then
    if [[ -f "$reviewer_root/src/index.ts" ]] && command -v npx >/dev/null 2>&1; then
      echo "tsx"
      return 0
    fi
  fi

  if [[ -f "$reviewer_root/dist/index.js" ]]; then
    echo "dist"
    return 0
  fi

  if [[ -f "$reviewer_root/src/index.ts" ]] && command -v npx >/dev/null 2>&1; then
    echo "tsx"
    return 0
  fi

  echo "Erro: artefatos do reviewer não encontrados em '$reviewer_root'. Execute npm ci (e npm run build no modo remoto)." >&2
  exit 1
}

run_reviewer() {
  local reviewer_root="$1"
  local runner_kind
  runner_kind="$(resolve_runner_cmd "$reviewer_root")"

  cd "$reviewer_root"

  local version
  version="$(node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); console.log(pkg.version);")"
  echo "=== [Runner] Executando Agentic Code Reviewers v$version (engine: $AGENTIC_CODE_REVIEWERS_ENGINE) ==="

  prepare_opencode

  case "$runner_kind" in
    tsx)
      npx tsx src/index.ts --repo-root "$CALLER_DIR" "${FORWARD_ARGS[@]}"
      ;;
    dist)
      node dist/index.js --repo-root "$CALLER_DIR" "${FORWARD_ARGS[@]}"
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)
      LOCAL_MODE=true
      shift
      ;;
    --engine)
      if [[ $# -lt 2 ]]; then
        echo "Erro: --engine requer um valor." >&2
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
        echo "Erro: -e requer um valor." >&2
        exit 1
      fi
      ENGINE_RAW="$2"
      shift 2
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    --)
      shift
      FORWARD_ARGS+=("$@")
      break
      ;;
    *)
      FORWARD_ARGS+=("$1")
      shift
      ;;
  esac
done

if is_truthy "$LOCAL_MODE"; then
  LOCAL_MODE=true
fi

AGENTIC_CODE_REVIEWERS_ENGINE="$(normalize_engine "$ENGINE_RAW")"
export AGENTIC_CODE_REVIEWERS_ENGINE

echo "=== [Runner] Iniciando Agentic Code Reviewers ==="
echo "Modo: $([[ "$LOCAL_MODE" == "true" ]] && echo local || echo remoto)"
echo "Diretório alvo da análise: $CALLER_DIR"
echo "Engine: $AGENTIC_CODE_REVIEWERS_ENGINE"

if [[ "$LOCAL_MODE" == "true" ]]; then
  ensure_prerequisites
  run_reviewer "$SCRIPT_DIR"
  exit 0
fi

ensure_prerequisites
echo "Repositório do reviewer: $REPO_URL"
echo "Branch release: $RELEASE_BRANCH"
echo "Script URL: $(default_runner_script_url)"

cleanup() {
  if [[ -d "$CALLER_DIR/$TEMP_DIR" ]]; then
    echo "=== [Runner] Limpando diretório temporário ==="
    rm -rf "$CALLER_DIR/$TEMP_DIR"
  fi
}
trap cleanup EXIT

rm -rf "$CALLER_DIR/$TEMP_DIR"

echo "=== [Runner] Baixando artefatos compilados (branch $RELEASE_BRANCH) ==="
git clone --depth 1 --branch "$RELEASE_BRANCH" "$REPO_URL" "$CALLER_DIR/$TEMP_DIR"

echo "=== [Runner] Instalando dependências de runtime ==="
cd "$CALLER_DIR/$TEMP_DIR"
npm ci --omit=dev

run_reviewer "$CALLER_DIR/$TEMP_DIR"
