Fixed fail-open on scanner crash in pre-commit.sh: non-zero SCAN_STATUS now prints to stderr and exits 1, matching the hook comment that a crashed scanner must not read as a clean scan.

siblingsFixed:
- .agents/skills/ws-secrets-leak-review/SKILL.md (docs no longer claim skip-on-non-zero after the scanner is resolved)

siblingsSkipped:
- missing skill / missing rg still exit 0 (optional-hook skip, different class)
- secrets_scanner.sh still exits 0 after HIGH text; the hook HIGH matcher is unchanged
