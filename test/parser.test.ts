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

  it('parseia JSON com suggestedFix contendo fences aninhados', () => {
    const output = [
      '```json',
      '{',
      '  "reviews": [{',
      '    "fileName": "src/a.ts",',
      '    "lineNumber": 10,',
      '    "severity": "warning",',
      '    "comment": "bug",',
      '    "score": 7,',
      '    "developerAction": "fix-code",',
      '    "analysis": "1. Evidence: a 2. Scenario: b 3. Protection: c 4. Discards: d",',
      '    "impactPaths": ["src/a.ts"],',
      '    "suggestedFix": "```javascript\\nfunction fix() { return 1; }\\n```"',
      '  }],',
      '  "resolvedThreads": [],',
      '  "reviewSummary": ""',
      '}',
      '```',
    ].join('\n');

    const parsed = parseAgentReviewOutput(output);
    assert.equal(parsed.reviews.length, 1);
    assert.equal(parsed.reviews[0]!.fileName, 'src/a.ts');
    assert.match(parsed.reviews[0]!.suggestedFix ?? '', /function fix/);
  });

  it('sanitiza escapes JSON inválidos (backtick, dot, colon) em suggestedFix', () => {
    // LLM wrote \` \. \: \' inside a JSON string — invalid JSON escapes.
    const bs = '\\';
    const fix =
      '```js\\nnew RegExp(' +
      bs +
      '`' +
      'x' +
      bs +
      '`' +
      ', ' +
      bs +
      "'" +
      'i' +
      bs +
      "'" +
      ');\\nconst r = /a' +
      bs +
      '.' +
      'b' +
      bs +
      ':' +
      'c/;\\n```';
    const envelope = {
      reviews: [
        {
          fileName: 'track.cjs',
          lineNumber: 34,
          severity: 'warning',
          comment: 'slug',
          score: 8,
          developerAction: 'fix-code',
          analysis: '1. Evidence: x 2. Scenario: y 3. Protection: z 4. Discards: w',
          impactPaths: ['track.cjs'],
          suggestedFix: '__FIX__',
        },
      ],
      resolvedThreads: [],
      reviewSummary: '',
    };
    const raw = '```json\n' + JSON.stringify(envelope, null, 2).replace('"__FIX__"', '"' + fix + '"') + '\n```';

    const parsed = parseAgentReviewOutput(raw);
    assert.equal(parsed.reviews.length, 1);
    assert.match(parsed.reviews[0]!.suggestedFix ?? '', /new RegExp/);
    assert.match(parsed.reviews[0]!.suggestedFix ?? '', /a\.b:c/);
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
