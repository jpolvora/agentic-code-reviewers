#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Script de Build e Release — Cursor Reviewer
# ──────────────────────────────────────────────────────────────────────
# Compila o TypeScript e publica apenas os artefatos de execução na
# branch 'release' do repositório remoto atual.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

# Garante que estamos na raiz do repositório
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "=== [1/5] Validando repositório e limpando diretórios ==="
if [ ! -f "package.json" ]; then
  echo "Erro: package.json não encontrado na raiz $REPO_ROOT"
  exit 1
fi

echo "=== [1.5] Incrementando versão (patch) ==="
if [ -z "$(git config user.name || true)" ]; then
  git config user.name "Cursor Reviewer Release Bot"
  git config user.email "bot@cursor-reviewer.local"
fi

npm version patch --no-git-tag-version
NEW_VERSION=$(grep '"version":' package.json | head -n 1 | cut -d '"' -f 4)
echo "Nova versão: $NEW_VERSION"

CURRENT_BRANCH=$(git branch --show-current)
if [ -n "$CURRENT_BRANCH" ]; then
  echo "Salvando nova versão na branch $CURRENT_BRANCH..."
  git add package.json package-lock.json
  git commit -m "chore: bump version to $NEW_VERSION" || true
  git push origin "$CURRENT_BRANCH" || true
fi

# Obter URL do remoto origin atual
REMOTE_URL=$(git remote get-url origin 2>/dev/null || git config --get remote.origin.url || echo "")
if [ -z "$REMOTE_URL" ]; then
  echo "Erro: Não foi possível determinar a URL do git remoto 'origin'."
  exit 1
fi

# Se for um repositório git local (caminho de diretório), converte em caminho absoluto
if [ -d "$REMOTE_URL" ]; then
  REMOTE_URL="$(cd "$REMOTE_URL" && pwd)"
fi

echo "Remoto detectado: $REMOTE_URL"

# Limpar builds antigos
rm -rf dist
rm -rf .release-tmp

echo "=== [2/5] Compilando TypeScript ==="
npm ci
npm run build

echo "=== [3/5] Preparando diretório de release ==="
mkdir -p .release-tmp

# Copiar apenas os arquivos estritamente necessários para runtime
cp -r dist .release-tmp/dist
cp -r skills .release-tmp/skills
cp package.json .release-tmp/package.json
cp package-lock.json .release-tmp/package-lock.json
cp README.md .release-tmp/README.md
cp LICENSE .release-tmp/LICENSE 2>/dev/null || true
cp AGENTS.md .release-tmp/AGENTS.md 2>/dev/null || true

# Criar um .gitignore específico para a branch de release (evitar commit de node_modules local por engano)
echo "node_modules/" > .release-tmp/.gitignore
echo ".release-tmp/" >> .release-tmp/.gitignore

echo "=== [4/5] Inicializando repositório temporário de release ==="
cd .release-tmp
git init -b release
git config user.name "Cursor Reviewer Release Bot"
git config user.email "bot@cursor-reviewer.local"

git add -A
git commit -m "chore: release build $NEW_VERSION ($(date '+%Y-%m-%d %H:%M:%S'))"

echo "=== [5/5] Publicando na branch 'release' ==="
git remote add origin "$REMOTE_URL"

# Força o push para a branch release no remoto origin
echo "Enviando artefatos de build para a branch 'release'..."
git push origin release --force

# Retorna e limpa
cd "$REPO_ROOT"
rm -rf .release-tmp

echo "=== Release concluído com sucesso! ==="
