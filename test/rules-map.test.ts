import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRulesMap, loadProjectRules, matchesGlob } from '../src/project/rules-map.js';

describe('matchesGlob', () => {
  it('casa padrões comuns de rules ABP', () => {
    assert.equal(matchesGlob('src/foo/Application/BookAppService.cs', '**/*.cs'), true);
    assert.equal(matchesGlob('src/foo/Application/BookAppService.cs', '**/*AppService*.cs'), true);
    assert.equal(matchesGlob('angular/src/app/book/book.component.ts', '**/angular/**/*.ts'), true);
    assert.equal(matchesGlob('readme.md', '**/*.cs'), false);
  });
});

describe('buildRulesMap', () => {
  it('mapeia rules alwaysApply e por glob para arquivos alterados', () => {
    const repoRoot = process.cwd().includes('cursor-reviewer')
      ? `${process.cwd()}/../..`
      : process.cwd();

    const rules = loadProjectRules(repoRoot);
    if (rules.length === 0) {
      return;
    }

    const result = buildRulesMap(repoRoot, ['src/SampleApp.Application/Books/BookAppService.cs']);

    assert.ok(result.alwaysApplyRules.length > 0);
    assert.ok(result.uniqueRules.length > 0);
    assert.ok(result.contextForPrompt.includes('Rules do projeto'));
    assert.ok(result.contextForPrompt.includes('main.mdc') || result.alwaysApplyRules.some((r) => r.includes('main.mdc')));
  });
});
