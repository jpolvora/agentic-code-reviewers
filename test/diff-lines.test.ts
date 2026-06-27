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
});
