import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseChangedLinesFromDiff, isLineInChangedDiff } from '../src/git/diff-lines.js';

const SAMPLE_DIFF = `diff --git a/src/Foo.cs b/src/Foo.cs
index 123..456 789
--- a/src/Foo.cs
+++ b/src/Foo.cs
@@ -10,3 +10,4 @@ namespace App
   line10
+  added line
   line12
`;

describe('parseChangedLinesFromDiff', () => {
  it('maps added lines on the right side', () => {
    const map = parseChangedLinesFromDiff(SAMPLE_DIFF);
    assert.ok(isLineInChangedDiff(map, '/src/Foo.cs', 11));
    assert.equal(isLineInChangedDiff(map, '/src/Foo.cs', 10), false);
  });

  it('handles rename to path', () => {
    const renameDiff = `diff --git a/old.ts b/new.ts
rename from old.ts
rename to new.ts
--- a/old.ts
+++ b/new.ts
@@ -1 +1,2 @@
 line
+added
`;
    const map = parseChangedLinesFromDiff(renameDiff);
    assert.ok(isLineInChangedDiff(map, '/new.ts', 2));
  });

  it('returns empty map for empty input', () => {
    assert.equal(parseChangedLinesFromDiff('').size, 0);
  });

  it('anchors deletion-only hunks so reviews are not silently discarded', () => {
    const deletionOnlyDiff = `diff --git a/src/Bar.cs b/src/Bar.cs
index abc..def 100644
--- a/src/Bar.cs
+++ b/src/Bar.cs
@@ -10,3 +10,0 @@ namespace App
-  removed line 1
-  removed line 2
-  removed line 3
`;
    const map = parseChangedLinesFromDiff(deletionOnlyDiff);
    const barLines = map.get('src/Bar.cs');
    assert.ok(barLines, 'file should be in the map');
    assert.ok(barLines.size > 0, 'deletion-only hunks should produce at least one anchor line');
    // The anchor line should be the right-side position (line 10)
    assert.ok(barLines.has(10));
  });
});
