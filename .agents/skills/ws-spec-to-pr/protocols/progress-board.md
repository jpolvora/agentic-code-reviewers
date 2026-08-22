# Progress Board

Render: bootstrap/resume; **phase boundaries** (F0→F1 … F5→F6); after failed steps; pause; `/status`; Step 8 final. Skip board on routine Advance when summary already shown.

```markdown
## Progress — US {us} (`{workflow-id}`)
**Status:** … | **Phase:** {Fx} | **Step:** {N} — {label} | **Branch:** `{branch}` | **Mode:** {autoMode→[AUTO] / dryRun→[DRY-RUN] / fullMode→[FULL] / scoreAndRefine→[SCORE-REFINE] / normal}
**Orchestrator session model:** {currentModel} | **Step models:** {list}
_Model switch: Pause → change model in IDE/agent host → resume._

### Pipeline — Phases
- [x] F0 Bootstrap · [ ] F2 Implementation ← **next** …

### Steps (0–9; omit internal substeps)
- [x] 0 [{model}] · [x] 1 [{model}] · … · [ ] 5 ← **next** [{currentModel}]

### Refinement _(Step 2 active only)_
Round {r}/3 · blocking: {n}

### Step 3 Execution Mode _(after Step 3)_
**Mode:** {execMode} · {reason}

### Step 5 DAG _(if execMode: parallel)_
- [x] T1 — …
```

Suffixes: `← next` · `⏭ skipped` · `↻ repeating` · `⏮ reopened`.

## Step 8 final board (after benchmark)

**Mandatory** after Step 8 benchmark — including `autoMode` / `fullMode` / `dryRun`. Source: state `telemetry` (sum of step `elapsedSec`; null → 0). Missing Total time → **HS-5**.

```markdown
### Telemetry
| Metric | Value |
|--------|-------|
| Total time | {h}h {m}m {s}s ({totalElapsedSec}s) |
| Total tokens | {tokens} (est: {bool}) |
| Lines +/- | +{added} / -{removed} (net: {netDelta}) |
| Token efficiency | {tokens/loc} tokens/LOC |
| Velocity | {loc/min} LOC/min |
```

## Step output banner (`autoMode` or `dryRun`)

```markdown
[AUTO] [DRY-RUN] **Starting step {N} {Label}**
[AUTO] **Finished step {N} {Label}**
```

Step 5: one pair per whole step. Print **Finished** on hard stop too.
