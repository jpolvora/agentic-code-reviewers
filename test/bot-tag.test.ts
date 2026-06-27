import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOT_TAG_PREFIX,
  buildBotTag,
  extractAgenticBotTagLine,
  isAgenticReviewerComment,
} from '../src/bot-tag.js';
import { loadConfig } from '../src/config.js';

describe('bot-tag', () => {
  it('buildBotTag concatena prefixo e engine', () => {
    assert.equal(buildBotTag('cursor-sdk'), 'Agentic Code Reviewer cursor-sdk');
    assert.equal(buildBotTag('opencode'), 'Agentic Code Reviewer opencode');
  });

  it('isAgenticReviewerComment detecta prefixo comum', () => {
    assert.equal(isAgenticReviewerComment('Agentic Code Reviewer cursor-sdk\n\nbug'), true);
    assert.equal(isAgenticReviewerComment('human comment'), false);
  });

  it('extractAgenticBotTagLine lê a primeira linha da tag', () => {
    assert.equal(
      extractAgenticBotTagLine('Agentic Code Reviewer opencode\n\n⚠️ warning'),
      'Agentic Code Reviewer opencode',
    );
  });

  it('loadConfig deriva botTag da engine (sem env BOT_TAG)', () => {
    const config = loadConfig(['--dry-run', '--engine', 'opencode']);
    assert.equal(config.botTag, `${BOT_TAG_PREFIX} opencode`);
  });
});
