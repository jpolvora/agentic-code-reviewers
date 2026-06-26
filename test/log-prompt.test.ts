import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Logger } from '../src/logger.js';
import {
  PROMPT_END_MARKER,
  PROMPT_START_MARKER,
  colorizePromptForDisplay,
  logAgentPromptBeforeSend,
  useAnsiColors,
} from '../src/agent/log-prompt.js';

describe('useAnsiColors', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('respeita NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    delete process.env.FORCE_COLOR;
    assert.equal(useAnsiColors(), false);
  });

  it('respeita FORCE_COLOR', () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
    assert.equal(useAnsiColors(), true);
  });
});

describe('colorizePromptForDisplay', () => {
  it('não altera o texto quando color=false', () => {
    const prompt = '# Título\n---\n> citação\n**Negrito**';
    assert.equal(colorizePromptForDisplay(prompt, false), prompt);
  });

  it('envolve cabeçalhos markdown em ANSI quando color=true', () => {
    const out = colorizePromptForDisplay('# Harness do projeto', true);
    assert.match(out, /\u001b\[1m\u001b\[36m# Harness do projeto\u001b\[0m/);
  });
});

describe('logAgentPromptBeforeSend', () => {
  const envBackup = { ...process.env };
  let infoLines: string[];
  let stdoutLines: string[];

  beforeEach(() => {
    infoLines = [];
    stdoutLines = [];
    process.env = { ...envBackup };
    delete process.env.TF_BUILD;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;

    console.log = (...args: unknown[]) => {
      stdoutLines.push(String(args[0]));
    };
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('emite banners locais e prompt colorizado quando não é pipeline', () => {
    process.env.NO_COLOR = '1';
    const logger = { info(message: string) { infoLines.push(message); } } as Logger;
    const prompt = 'linha 1\nlinha 2';

    logAgentPromptBeforeSend(logger, prompt);

    assert.equal(infoLines.length, 2);
    assert.match(infoLines[0], new RegExp(PROMPT_START_MARKER));
    assert.match(infoLines[1], new RegExp(PROMPT_END_MARKER));
    assert.equal(stdoutLines.length, 1);
    assert.equal(stdoutLines[0], prompt);
  });

  it('usa ##[group] colapsável na Azure Pipeline', () => {
    process.env.TF_BUILD = 'True';
    process.env.NO_COLOR = '1';
    const logger = { info(message: string) { infoLines.push(message); } } as Logger;
    const prompt = '# Secao\nconteudo';

    logAgentPromptBeforeSend(logger, prompt);

    assert.match(stdoutLines[0], /^##\[group\]/);
    assert.match(stdoutLines[0], new RegExp(PROMPT_START_MARKER));
    assert.equal(stdoutLines[1], prompt);
    assert.match(stdoutLines[2], new RegExp(PROMPT_END_MARKER));
    assert.equal(stdoutLines[3], '##[endgroup]');
    assert.equal(infoLines.length, 1);
    assert.match(infoLines[0], /grupo colapsável acima/);
  });
});
