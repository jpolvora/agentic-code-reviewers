const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Carrega .env se existir
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  }
}

async function main() {
  const threadId = process.argv[2];
  const commentBody = process.argv[3] || 'Resolvendo a thread via automação (corrigido)';

  if (!threadId) {
    console.error('Error: Please specify the thread ID as the first argument.');
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN or GH_TOKEN environment variable is not defined.');
    process.exit(1);
  }

  const query = `
    mutation ResolveAndReply($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
        comment {
          id
        }
      }
      resolveReviewThread(input: { threadId: $threadId }) {
        thread {
          id
          isResolved
        }
      }
    }
  `;

  const url = 'https://api.github.com/graphql';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'solve-pr-helper'
    },
    body: JSON.stringify({
      query,
      variables: { threadId, body: commentBody }
    })
  });

  if (!response.ok) {
    console.error(`GitHub API Request failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  const result = await response.json();
  if (result.errors) {
    console.error('GitHub API returned errors:', JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }

  const isResolved = result.data?.resolveReviewThread?.thread?.isResolved;
  if (isResolved) {
    console.log(`Successfully replied and resolved thread: ${threadId}`);
  } else {
    console.log(`Failed to resolve thread: ${threadId}. Response:`, JSON.stringify(result.data, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
