#!/usr/bin/env bash
# secrets_scanner.sh — Optional CLI / pre-commit scan (interactive skill does NOT run this).
# No process substitution; no pipe|while subshells (both hang or drop writes on Windows Git Bash).
# Usage: bash .agents/skills/ws-secrets-leak-review/scripts/secrets_scanner.sh
# Env: GIT_STAGED_ONLY=1  SECRETS_SCAN_MAX_HITS=50
set -euo pipefail

STAGED_ONLY="${GIT_STAGED_ONLY:-0}"
MAX_HITS="${SECRETS_SCAN_MAX_HITS:-50}"

for cmd in rg git; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' not found. Install ripgrep (rg) and git."
    exit 1
  fi
done

RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
cd "$REPO_ROOT"

HIGH_FILE=$(mktemp)
MED_FILE=$(mktemp)
IGNORE_FILE=$(mktemp)
HITS_FILE=$(mktemp)
LIST_FILE=$(mktemp)
cleanup() { rm -f "$HIGH_FILE" "$MED_FILE" "$IGNORE_FILE" "$HITS_FILE" "$LIST_FILE"; }
trap cleanup EXIT

STAGED_LIST=""
if [ "$STAGED_ONLY" = "1" ]; then
  git diff --cached --name-only --diff-filter=ACM 2>/dev/null > "$LIST_FILE" || true
  if [ ! -s "$LIST_FILE" ]; then
    echo -e "${YELLOW}No staged files. Nothing to scan.${NC}"
    exit 0
  fi
  STAGED_LIST=$(cat "$LIST_FILE")
fi

is_staged() {
  [ "$STAGED_ONLY" != "1" ] && return 0
  rg -qFx "$1" "$LIST_FILE"
}

append_finding() {
  local out="$1" file="$2" line="$3" label="$4" detail="$5"
  if [ "$file" = "." ] || [ "$file" = "(staged-diff)" ] || is_staged "$file"; then
    detail=$(printf '%s' "$detail" | cut -c1-80)
    printf '%s|%s|%s|%s\n' "$file" "$line" "$label" "$detail" >> "$out"
  fi
}

# Collect matches into HITS_FILE. Never use < <(...) or pipe|while.
collect_hits() {
  local pattern="$1"
  : > "$HITS_FILE"
  if [ "$STAGED_ONLY" = "1" ]; then
    # Added lines only (ACM). Ignore deletions and AWS/docs EXAMPLE placeholders.
    git diff --cached -U0 --diff-filter=ACM 2>/dev/null \
      | rg -e '^\+[^+]' > "$LIST_FILE.diff" || true
    rg -n --max-filesize 512K -e "$pattern" "$LIST_FILE.diff" 2>/dev/null \
      | rg -v 'allowlist secret' \
      | rg -vi 'EXAMPLE|AKIAIOSFODNN7EXAMPLE|wJalrXUtnFEMI/K7MDENG' \
      | head -n "$MAX_HITS" > "$HITS_FILE" || true
    rm -f "$LIST_FILE.diff"
    return 0
  fi
  # Full scan: single rg, ignore-aware, size-capped, glob-limited
  rg -n --max-filesize 512K \
    -g '*.env' -g '*.env.*' -g '*.json' -g '*.yml' -g '*.yaml' -g '*.toml' \
    -g '*.xml' -g '*.ini' -g '*.cfg' -g '*.conf' -g '*.properties' \
    -g '*.sh' -g '*.bash' -g '*.ps1' -g '*.py' -g '*.js' -g '*.jsx' \
    -g '*.ts' -g '*.tsx' -g '*.cs' -g '*.java' -g '*.go' -g '*.rb' \
    -g '*.php' -g '*.tf' -g '*.md' -g '*.txt' \
    -g '!**/node_modules/**' -g '!**/.git/**' -g '!**/dist/**' \
    -g '!**/build/**' -g '!**/.next/**' -g '!**/vendor/**' \
    -e "$pattern" . 2>/dev/null \
    | rg -v 'allowlist secret' \
    | head -n "$MAX_HITS" > "$HITS_FILE" || true
}

consume_hits() {
  local label="$1" level="$2" out
  case "$level" in
    high) out="$HIGH_FILE" ;;
    medium) out="$MED_FILE" ;;
  esac
  if [ ! -s "$HITS_FILE" ]; then
    return 0
  fi
  if [ "$STAGED_ONLY" = "1" ]; then
    # Diff lines have no path; still block on HIGH matches
    local n=0
    while IFS= read -r row; do
      [ -z "$row" ] && continue
      n=$((n + 1))
      append_finding "$out" "(staged-diff)" "$n" "$label" "$row"
    done < "$HITS_FILE"
    return 0
  fi
  local file line rest
  while IFS=: read -r file line rest; do
    [ -z "${file:-}" ] && continue
    append_finding "$out" "$file" "$line" "$label" "$rest"
  done < "$HITS_FILE"
}

scan_pat() {
  collect_hits "$1"
  consume_hits "$2" "$3"
}

echo -e "${BLUE}Scanning $(basename "$(pwd)") for secrets & leaks (bounded)...${NC}"
echo ""

scan_pat 'AKIA[0-9A-Z]{16}' 'AWS Access Key' high
scan_pat 'gh[ps]_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9]{36,}' 'GitHub Token' high
scan_pat 'xox[bpras]-[0-9a-zA-Z-]{24,}' 'Slack Token' high
scan_pat 'sk-[a-zA-Z0-9]{32,}' 'API Key (sk-...)' high
scan_pat '-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----' 'Private Key' high
scan_pat '(postgresql|mysql|mongodb(\+srv)?|redis|jdbc)://[^:]+:[^@]+@' 'DB Connection String' high
scan_pat 'Bearer[[:space:]]+[A-Za-z0-9\-._~+/]{40,}' 'Bearer Token' medium

# Sensitive filenames via git inventory → temp file → rg (no pipe|while)
if [ "$STAGED_ONLY" = "1" ]; then
  git diff --cached --name-only --diff-filter=ACM 2>/dev/null > "$LIST_FILE" || true
else
  git ls-files --cached --others --exclude-standard 2>/dev/null > "$LIST_FILE" || true
fi

check_names() {
  local pattern="$1" label="$2" level="$3" out
  case "$level" in
    high) out="$HIGH_FILE" ;;
    medium) out="$MED_FILE" ;;
  esac
  rg "$pattern" "$LIST_FILE" 2>/dev/null | head -n 40 > "$HITS_FILE" || true
  local f
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    append_finding "$out" "." "(exists)" "$label" "$f"
  done < "$HITS_FILE"
}

check_names '\.env$' '.env file' high
check_names '\.env\.[^e]' '.env.* file (not .env.example)' high
check_names '\.pem$' 'PEM certificate/key' medium
check_names '\.key$' 'Private key file (.key)' medium
check_names '\.pfx$|\.p12$' 'PKCS12 keystore' high
check_names 'secrets\.ya?ml$' 'Secrets YAML file' high
check_names 'credentials\.json$|credentials\.toml$' 'Credentials file' high
check_names 'id_rsa$|id_ecdsa$|id_ed25519$' 'SSH private key file' high

# Literal whole-line compare: entries like *.pem are globs, not regexes, and Windows
# checkouts leave a trailing CR that would defeat an anchored pattern match.
gitignore_has() {
  local entry="$1" line
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="${line#/}"
    [ "$line" = "$entry" ] && return 0
  done < .gitignore
  return 1
}

if [ -f .gitignore ]; then
  for entry in '.env' '.env.*' '*.pem' '*.key' '*.pfx' 'secrets.yml' 'credentials.json' '.aws/'; do
    if ! gitignore_has "$entry"; then
      echo "$entry" >> "$IGNORE_FILE"
    fi
  done
fi

HIGH_COUNT=$(wc -l < "$HIGH_FILE" | tr -d ' ')
MED_COUNT=$(wc -l < "$MED_FILE" | tr -d ' ')

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}              L E A K   S C A N   R E P O R T     ${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo ""

if [ "$HIGH_COUNT" = "0" ] && [ "$MED_COUNT" = "0" ]; then
  echo -e "${YELLOW}No leaks detected.${NC}"
else
  if [ "$HIGH_COUNT" != "0" ]; then
    echo -e "${RED}HIGH — must fix before push (${HIGH_COUNT})${NC}"
    echo "| File | Line | Type | Detail |"
    echo "|------|------|------|--------|"
    while IFS='|' read -r file line type detail; do
      echo "| $file | $line | $type | $detail |"
    done < "$HIGH_FILE"
    echo ""
  fi
  if [ "$MED_COUNT" != "0" ]; then
    echo -e "${YELLOW}MEDIUM — review recommended (${MED_COUNT})${NC}"
    echo "| File | Line | Type | Detail |"
    echo "|------|------|------|--------|"
    while IFS='|' read -r file line type detail; do
      echo "| $file | $line | $type | $detail |"
    done < "$MED_FILE"
    echo ""
  fi
fi

IGNORE_COUNT=$(wc -l < "$IGNORE_FILE" | tr -d ' ')
if [ "$IGNORE_COUNT" != "0" ]; then
  echo -e "${YELLOW}.gitignore warnings${NC}"
  while IFS= read -r entry; do
    echo "- '$entry' not in .gitignore"
  done < "$IGNORE_FILE"
fi

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
exit 0
