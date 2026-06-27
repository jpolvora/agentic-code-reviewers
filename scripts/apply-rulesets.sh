#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
RULESETS_DIR="$ROOT/.github/rulesets"
OWNER="${GITHUB_REPOSITORY_OWNER:-$(gh repo view --json owner -q .owner.login)}"
REPO="${GITHUB_REPOSITORY_NAME:-$(gh repo view --json name -q .name)}"

if [[ ! -d "$RULESETS_DIR" ]]; then
  echo "No rulesets directory: $RULESETS_DIR" >&2
  exit 1
fi

for file in "$RULESETS_DIR"/*.json; do
  [[ -f "$file" ]] || continue
  name="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).name)" "$file")"
  id="$(gh api "repos/$OWNER/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id" | head -n1)"

  if [[ -n "$id" ]]; then
    echo "Updating ruleset '$name' (id=$id) from $(basename "$file")"
    gh api -X PUT "repos/$OWNER/$REPO/rulesets/$id" --input "$file" >/dev/null
  else
    echo "Creating ruleset '$name' from $(basename "$file")"
    gh api -X POST "repos/$OWNER/$REPO/rulesets" --input "$file" >/dev/null
  fi
done

echo
echo "Active rulesets:"
gh api "repos/$OWNER/$REPO/rulesets" --jq '.[] | "- \(.name) (\(.enforcement), target=\(.target))"'
