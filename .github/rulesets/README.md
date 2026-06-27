# Repository rulesets

JSON source-of-truth for GitHub branch rulesets on **`main`**.

| File | Purpose |
| :--- | :--- |
| [`agentic-main.json`](agentic-main.json) | Protect default branch: block deletion/force-push, require PR, **require all review threads resolved before merge** |

## Apply

Requires `gh` authenticated with admin access to the repository:

```bash
bash scripts/apply-rulesets.sh
```

The script upserts rulesets by `name` via `gh api` (create if missing, update if present).

## Export from GitHub UI

Settings → Rules → Rulesets → ⋮ → **Export** → save JSON here and strip read-only fields (`id`, `source`, `created_at`, `updated_at`, `_links`, `bypass_actors` if managed separately).
