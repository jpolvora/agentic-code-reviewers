import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalFilePath, normalizeFilePath, reviewDedupKey } from '../src/ado/utils.js';

describe('canonicalFilePath', () => {
  it('preserves original case', () => {
    assert.equal(canonicalFilePath('/src/Human.cs'), '/src/Human.cs');
  });

  it('normalizes backslashes to forward slashes', () => {
    assert.equal(canonicalFilePath('src\\Controllers\\Foo.cs'), '/src/Controllers/Foo.cs');
  });

  it('adds leading slash when missing', () => {
    assert.equal(canonicalFilePath('src/foo.ts'), '/src/foo.ts');
  });

  it('preserves already-normalized path', () => {
    assert.equal(canonicalFilePath('/src/foo.ts'), '/src/foo.ts');
  });

  it('preserves case for PascalCase filenames', () => {
    assert.equal(canonicalFilePath('/Controllers/AuditController.cs'), '/Controllers/AuditController.cs');
  });

  it('handles mixed backslash and forward slash', () => {
    assert.equal(canonicalFilePath('src\\sub/file.ts'), '/src/sub/file.ts');
  });
});

describe('normalizeFilePath', () => {
  it('lowercases the path', () => {
    assert.equal(normalizeFilePath('/src/Human.cs'), '/src/human.cs');
  });

  it('adds leading slash and lowercases', () => {
    assert.equal(normalizeFilePath('src/Foo.ts'), '/src/foo.ts');
  });

  it('normalizes backslashes and lowercases', () => {
    assert.equal(normalizeFilePath('src\\Bar.ts'), '/src/bar.ts');
  });
});

describe('reviewDedupKey', () => {
  it('produces lowercase path and line number key', () => {
    assert.equal(reviewDedupKey('/src/Human.cs', 42), '/src/human.cs|line:42');
  });

  it('adds leading slash if missing', () => {
    assert.equal(reviewDedupKey('src/foo.ts', 1), '/src/foo.ts|line:1');
  });
});
