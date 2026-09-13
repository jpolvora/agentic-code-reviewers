# PR-24 review report — round 1

| Field | Value |
|-------|-------|
| PR | https://github.com/jpolvora/agentic-code-reviewers/pull/24 |
| Thread | PRRT_kwDOTGZdV86bVp6C |
| Score | 7 |
| Action | fix-code |
| Defect class | pre-commit fail-open on scanner crash |

## Fix

- `.agents/skills/ws-secrets-leak-review/scripts/pre-commit.sh`: non-zero scanner exit now prints to stderr and `exit 1`.
- `.agents/skills/ws-secrets-leak-review/SKILL.md`: skip remains only for missing skill/`rg`; resolved-scanner crash is fail-closed.

## Sibling sweep

- `siblingsFixed`: SKILL.md contract sentence.
- `siblingsSkipped`: missing skill/`rg` (optional hook); `secrets_scanner.sh` HIGH still `exit 0` (hook HIGH text matcher).

## Verification

- `bash -n` pre-commit.sh: pass
- `npm run build`: pass
- `npm test`: 347 tests, 0 fail, 4 skipped

## ws-code-review (this-round diff)

No Critical/Warning on the two touched files. Behavior matches the thread proof (crash after scanner resolve must not look like a clean skip).
