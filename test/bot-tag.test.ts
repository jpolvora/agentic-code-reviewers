import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOT_TAG_PREFIX,
  buildBotTag,
  extractAgenticBotTagLine,
  isAgenticReviewerComment,
  stripAgenticBotTags,
} from '../src/bot-tag.js';
import { loadConfig } from '../src/config.js';

describe('bot-tag', () => {
  it('buildBotTag concatena produto, versão e engine', () => {
    assert.equal(buildBotTag('cursor-sdk', '0.4.0'), 'agentic-code-reviewers v0.4.0 (cursor-sdk)');
    assert.equal(buildBotTag('opencode', '0.4.0'), 'agentic-code-reviewers v0.4.0 (opencode)');
    assert.equal(buildBotTag('cursor-sdk'), 'agentic-code-reviewers (cursor-sdk)');
  });

  it('loadConfig deriva botTag da engine e da versão do pacote', () => {
    const config = loadConfig(['--dry-run', '--engine', 'opencode', '--source-branch', 'refs/heads/develop']);
    assert.equal(config.botTag, `${BOT_TAG_PREFIX} v${config.version} (opencode)`);
  });

  it('reconhece tags atuais e legadas', () => {
    assert.equal(isAgenticReviewerComment('agentic-code-reviewers v0.4.0 (cursor-sdk)\nissue'), true);
    assert.equal(isAgenticReviewerComment('Agentic Code Reviewer cursor-sdk\nissue'), true);
    assert.equal(isAgenticReviewerComment('[Cursor Reviewer]\nissue'), true);
    assert.equal(isAgenticReviewerComment('unrelated comment'), false);
    assert.equal(
      extractAgenticBotTagLine('agentic-code-reviewers v0.4.0 (opencode)\nbody'),
      'agentic-code-reviewers v0.4.0 (opencode)',
    );
    assert.equal(extractAgenticBotTagLine('Agentic Code Reviewer cursor-sdk\nbody'), 'Agentic Code Reviewer cursor-sdk');
    assert.equal(stripAgenticBotTags('agentic-code-reviewers v0.4.0 (cursor-sdk)\nhello'), 'hello');
    assert.equal(stripAgenticBotTags('Agentic Code Reviewer cursor-sdk\nhello'), 'hello');
  });
});
