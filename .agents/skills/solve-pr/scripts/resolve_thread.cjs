const fs = require('fs');

const RESOLUTION_MARKER = '<!-- resolution-reply -->';
const DEFAULT_BOT_TAG = '[Cursor Reviewer]';

function loadDotEnv() {
  if (!fs.existsSync('.env')) return;
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    process.env[key] = value.trim();
  }
}

function resolveToken() {
  return (
    process.env.AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN
  );
}

function buildResolutionBody(note, botTag) {
  const explanation = note?.trim() || 'Issue corrigida na iteração atual.';
  return [
    botTag,
    RESOLUTION_MARKER,
    '',
    'Issue addressed in the current iteration. Marking as resolved.',
    '',
    explanation,
  ].join('\n');
}

async function main() {
  loadDotEnv();

  const threadId = process.argv[2];
  const note = process.argv[3];
  const botTag = process.env.AGENTIC_CODE_REVIEWERS_BOT_TAG || DEFAULT_BOT_TAG;

  if (!threadId) {
    console.error('Usage: node resolve_thread.cjs <THREAD_ID> "<resolution note>"');
    process.exit(1);
  }

  const token = resolveToken();
  if (!token) {
    console.error(
      'Error: Set AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN, GITHUB_TOKEN, or GH_TOKEN.',
    );
    process.exit(1);
  }

  const body = buildResolutionBody(note, botTag);

  const query = `
    mutation ResolveAndReply($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
        comment { id }
      }
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { id isResolved }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'solve-pr-cooperative',
    },
    body: JSON.stringify({ query, variables: { threadId, body } }),
  });

  if (!response.ok) {
    console.error(`GitHub API failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  const result = await response.json();
  if (result.errors) {
    console.error('GraphQL errors:', JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }

  const isResolved = result.data?.resolveReviewThread?.thread?.isResolved;
  if (isResolved) {
    console.log(`Resolved thread ${threadId} (cooperative resolution-reply posted).`);
  } else {
    console.error('Failed to resolve thread:', JSON.stringify(result.data, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
