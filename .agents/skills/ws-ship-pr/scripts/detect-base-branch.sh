#!/usr/bin/env bash
# Print the production default branch: master or main.
set -euo pipefail

if command -v gh >/dev/null 2>&1; then
  branch="$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || true)"
  if [[ -n "${branch:-}" ]]; then
    echo "$branch"
    exit 0
  fi
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

for candidate in master main; do
  if git show-ref --verify --quiet "refs/heads/$candidate" \
    || git show-ref --verify --quiet "refs/remotes/origin/$candidate"; then
    echo "$candidate"
    exit 0
  fi
done

echo "ship-pr: could not detect master or main default branch" >&2
exit 1
