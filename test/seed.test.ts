import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { evaluateSeedResponse, loadSeedManifest } from '../src/seed/evaluate-response.js';
import { FIXTURES_ROOT, buildSeedTargets } from '../src/seed/paths.js';
import { listInstalledSeedPaths } from '../src/seed/uninstall-fixtures.js';

const runnerRoot = resolve(import.meta.dirname, '..');

describe('seed fixtures', () => {
  it('manifest e arquivos fixture existem', (t) => {
    if (buildSeedTargets().length === 0) {
      t.skip('projeto não possui layout ABP (src/*Application + angular/src/app)');
      return;
    }
    assert.ok(existsSync(resolve(FIXTURES_ROOT, 'expected-scenarios.json')));
    const seedTargets = buildSeedTargets();
    for (const target of seedTargets) {
      assert.ok(existsSync(target.fixturePath), target.fixturePath);
    }

    const manifest = loadSeedManifest();
    assert.equal(manifest.scenarios.length, 6);
    assert.ok(manifest.minimumRequired >= 5);
  });

  it('cada fixture contém marcador CURSOR-REVIEWER-SEED', (t) => {
    if (buildSeedTargets().length === 0) {
      t.skip('projeto não possui layout ABP (src/*Application + angular/src/app)');
      return;
    }
    const seedTargets = buildSeedTargets();
    for (const target of seedTargets) {
      const content = readFileSync(target.fixturePath, 'utf8');
      assert.match(content, /CURSOR-REVIEWER-SEED|SEED-[BF]/);
    }
  });
});

describe('evaluateSeedResponse', () => {
  const samplePath = resolve(runnerRoot, 'fixtures/seed/sample-evaluate-output.txt');

  it('detecta cenários obrigatórios na amostra de avaliação (5/5)', () => {
    assert.ok(existsSync(samplePath), `amostra ausente: ${samplePath}`);

    const result = evaluateSeedResponse(readFileSync(samplePath, 'utf8'));

    assert.equal(result.requiredTotal, 5);
    assert.ok(
      result.requiredDetected >= result.manifest.minimumRequired,
      result.summary,
    );

    const requiredIds = result.scenarioResults
      .filter((r) => r.scenario.required)
      .filter((r) => r.matched)
      .map((r) => r.scenario.id);

    assert.ok(requiredIds.includes('SEED-B1'));
    assert.ok(requiredIds.includes('SEED-B2'));
    assert.ok(requiredIds.includes('SEED-B3'));
    assert.ok(requiredIds.includes('SEED-F2'));
    assert.ok(requiredIds.includes('SEED-F3'));
  });

  it('reviews detectados incluem suggestedFix', () => {
    const result = evaluateSeedResponse(readFileSync(samplePath, 'utf8'));

    for (const row of result.scenarioResults.filter((r) => r.matched)) {
      assert.ok(row.review?.suggestedFix?.trim(), `${row.scenario.id} sem suggestedFix`);
    }
  });
});

describe('workspace seed hygiene', () => {
  it('lista paths instalados quando seeds estão no workspace', (t) => {
    if (buildSeedTargets().length === 0) {
      t.skip('projeto não possui layout ABP (src/*Application + angular/src/app)');
      return;
    }
    const installed = listInstalledSeedPaths();
    assert.ok(Array.isArray(installed));
  });
});
