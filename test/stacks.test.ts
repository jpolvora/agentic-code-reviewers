import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getStackConfig, STACKS } from '../src/config.js';

describe('stacks config', () => {
  it('contém definições de stack com includePatterns válidos', () => {
    const abp = STACKS['abp/angular'];
    assert.ok(abp);
    assert.equal(abp.name, 'ABP/Angular');
    assert.ok(abp.includePatterns.includes('**/*.cs'));

    const php = STACKS['php/laravel'];
    assert.ok(php);
    assert.equal(php.name, 'PHP/Laravel');
    assert.ok(php.includePatterns.includes('**/*.php'));

    const nextjs = STACKS['nextjs/react'];
    assert.ok(nextjs);
    assert.equal(nextjs.name, 'Next.js/React');
    assert.ok(nextjs.includePatterns.includes('**/*.tsx'));

    const ts = STACKS['typescript'];
    assert.ok(ts);
    assert.equal(ts.name, 'TypeScript');
    assert.ok(ts.includePatterns.includes('**/*.ts'));
    assert.ok(ts.includePatterns.includes('**/*.tsx'));
    assert.ok(ts.includePatterns.includes('**/*.json'));
  });

  it('normaliza e detecta stacks corretamente via getStackConfig', () => {
    // ABP/Angular cases
    assert.equal(getStackConfig('ABP/Angular')?.name, 'ABP/Angular');
    assert.equal(getStackConfig('abp-angular')?.name, 'ABP/Angular');
    assert.equal(getStackConfig('abp/angular ')?.name, 'ABP/Angular');
    assert.equal(getStackConfig('abpangular')?.name, 'ABP/Angular');

    // PHP/Laravel cases
    assert.equal(getStackConfig('PHP/Laravel')?.name, 'PHP/Laravel');
    assert.equal(getStackConfig('php-laravel')?.name, 'PHP/Laravel');
    assert.equal(getStackConfig('phplaravel')?.name, 'PHP/Laravel');

    // Next.js/React cases
    assert.equal(getStackConfig('Next.js/React')?.name, 'Next.js/React');
    assert.equal(getStackConfig('nextjs-react')?.name, 'Next.js/React');
    assert.equal(getStackConfig('nextjs')?.name, 'Next.js/React');
    assert.equal(getStackConfig('react')?.name, 'Next.js/React');

    // TypeScript cases
    assert.equal(getStackConfig('TypeScript')?.name, 'TypeScript');
    assert.equal(getStackConfig('typescript')?.name, 'TypeScript');
    assert.equal(getStackConfig('ts')?.name, 'TypeScript');

    // Invalid case
    assert.equal(getStackConfig('invalid-stack'), undefined);
  });

  it('todos os arquivos de recomendação associados existem no disco', () => {
    const runnerRoot = process.cwd();
    for (const stackKey of Object.keys(STACKS)) {
      const config = STACKS[stackKey];
      const filePath = resolve(runnerRoot, 'skills', 'stacks', config.promptFileName);
      assert.ok(
        existsSync(filePath),
        `Arquivo de prompt da stack ${config.name} não encontrado em: ${filePath}`,
      );
    }
  });
});
