import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { AdoProvider } from '../src/provider/azuredevops.js';

describe('AdoProvider — postPrComment', () => {
  it('posts a closed thread comment with bot tag prefix', async () => {
    const posts: { path: string; body: unknown }[] = [];
    const log = mock.fn();
    const provider = new AdoProvider();
    await provider.initialize(
      {
        organization: 'test-org',
        project: 'Test Project',
        repositoryName: 'test-repo',
        pullRequestId: 18,
        adoAccessToken: 'fake-pat',
      } as any,
      { info: mock.fn(), error: mock.fn(), warn: mock.fn(), section: mock.fn() } as any,
    );
    (provider as any).ado.post = async (path: string, body: unknown) => {
      posts.push({ path, body });
      return { id: 789 };
    };

    const ok = await provider.postPrComment(
      'Agentic Code Reviewer test',
      '<!-- auto-fix-summary -->\nsummary body',
      log,
    );

    assert.equal(ok, true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].path, '/pullRequests/18/threads?api-version=7.1');
    const sent = (posts[0].body as any);
    assert.equal(sent.status, 'closed');
    assert.equal(sent.comments.length, 1);
    assert.equal(sent.comments[0].parentCommentId, 0);
    assert.equal(sent.comments[0].commentType, 1);
    const content = sent.comments[0].content as string;
    assert.match(content, /Agentic Code Reviewer test/);
    assert.match(content, /auto-fix-summary/);
    assert.equal(log.mock.callCount(), 1);
    assert.match(log.mock.calls[0].arguments[0], /posted/i);
  });

  it('returns false when ado.post throws', async () => {
    const logCalls: string[] = [];
    const log = (msg: string) => { logCalls.push(msg); };
    const provider = new AdoProvider();
    await provider.initialize(
      {
        organization: 'test-org',
        project: 'Test Project',
        repositoryName: 'test-repo',
        pullRequestId: 18,
        adoAccessToken: 'fake-pat',
      } as any,
      { info: mock.fn(), error: mock.fn(), warn: mock.fn(), section: mock.fn() } as any,
    );
    (provider as any).ado.post = async () => {
      throw new Error('ADO API error');
    };

    const ok = await provider.postPrComment('BotTag', 'body', log);

    assert.equal(ok, false);
    assert.equal(logCalls.length, 1);
    assert.match(logCalls[0], /failed/);
  });
});
