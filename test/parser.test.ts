import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractJsonFromAgentOutput, parseAgentReviewOutput } from '../src/parser/review-response.js';

describe('parseAgentReviewOutput', () => {
  it('fecha o bloco json no primeiro fence após o conteúdo', () => {
    const output = [
      'texto antes',
      '```json',
      '{"reviews":[],"resolvedThreads":[],"reviewSummary":"ok"}',
      '```',
      'texto indevido depois',
      '```ts',
      'const ignored = true;',
      '```',
    ].join('\n');

    assert.equal(
      extractJsonFromAgentOutput(output),
      '{"reviews":[],"resolvedThreads":[],"reviewSummary":"ok"}',
    );
  });

  it('parseia o último objeto JSON válido quando o stdout contém logs e JSON duplicado', () => {
    const first = '{"reviews":[{"fileName":"/src/A.cs","lineNumber":1,"severity":"critical","comment":"first"}],"resolvedThreads":[],"reviewSummary":""}';
    const second = '{"reviews":[{"fileName":"/src/B.cs","lineNumber":2,"severity":"critical","comment":"second"}],"resolvedThreads":[],"reviewSummary":""}';
    const parsed = parseAgentReviewOutput(`[assistant] ${first}\n[DRY-RUN]\n${second}`);

    assert.equal(parsed.reviews.length, 1);
    assert.equal(parsed.reviews[0].fileName, '/src/B.cs');
    assert.equal(parsed.reviews[0].comment, 'second');
  });

  it('lança erro quando "reviews" não é um array', () => {
    assert.throws(
      () => parseAgentReviewOutput('```json\n{"reviews":"oops","resolvedThreads":[],"reviewSummary":""}\n```'),
      /reviews.*deve ser um array/i,
    );
  });

  it('normaliza fileName e impactPaths com trim', () => {
    const parsed = parseAgentReviewOutput(
      '```json\n{"reviews":[{"fileName":" src/Foo.cs ","lineNumber":42,"severity":"critical","comment":"x","score":8,"urgency":"high","developerAction":"fix-code","analysis":"a","impactPaths":[" /src/Foo.cs "],"suggestedFix":"fix"}],"resolvedThreads":[],"reviewSummary":""}\n```',
    );
    assert.equal(parsed.reviews[0].fileName, 'src/Foo.cs');
    assert.deepEqual(parsed.reviews[0].impactPaths, ['/src/Foo.cs']);
  });
});
