#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Cursor Reviewer Remote Runner
# ──────────────────────────────────────────────────────────────────────
# Este script clona a branch 'release' do cursor-reviewer, instala as
# dependências de runtime e executa o reviewer no contexto do projeto atual.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

# Configurações padrão
CURSOR_REVIEWER_REPO_URL="${CURSOR_REVIEWER_REPO_URL:-https://github.com/jpolvora/cursor-reviewer.git}"
TEMP_DIR=".tmp-cursor-reviewer"
CALLER_DIR="$(pwd)"

echo "=== [Runner] Iniciando execução remota do Cursor Reviewer ==="
echo "Repositório do Reviewer: $CURSOR_REVIEWER_REPO_URL"
echo "Diretório Alvo da Análise: $CALLER_DIR"

# Função de limpeza para execução pós-término ou interrupção
cleanup() {
  if [ -d "$CALLER_DIR/$TEMP_DIR" ]; then
    echo "=== [Runner] Limpando diretório temporário ==="
    rm -rf "$CALLER_DIR/$TEMP_DIR"
  fi
}
trap cleanup EXIT

# Garante que qualquer diretório temporário anterior seja removido
rm -rf "$CALLER_DIR/$TEMP_DIR"

echo "=== [Runner] Baixando artefatos compilados (branch release) ==="
# Clona de forma rasa (--depth 1) para ser o mais rápido possível
git clone --depth 1 --branch release "$CURSOR_REVIEWER_REPO_URL" "$CALLER_DIR/$TEMP_DIR"

echo "=== [Runner] Instalando dependências de runtime ==="
cd "$CALLER_DIR/$TEMP_DIR"

# Instala apenas as dependências necessárias de produção
npm ci --omit=dev

VERSION=$(node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); console.log(pkg.version);")
echo "=== [Runner] Executando Cursor Reviewer Agent (v$VERSION) ==="
# Executa o reviewer passando o diretório original do chamador como repo-root e encaminhando os argumentos
node dist/index.js --repo-root "$CALLER_DIR" "$@"
