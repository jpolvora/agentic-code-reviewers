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
  const prIdStr = process.argv[2];
  if (!prIdStr) {
    console.error('Error: Please specify the pull request ID as an argument.');
    process.exit(1);
  }
  const prId = parseInt(prIdStr, 10);
  if (isNaN(prId)) {
    console.error('Error: Pull request ID must be an integer.');
    process.exit(1);
  }

  // Get git remote info
  let remoteUrl;
  try {
    remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error('Error: Could not retrieve git remote URL. Make sure you are in a git repository.');
    process.exit(1);
  }

  const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^.]+)/);
  if (!match) {
    console.error(`Error: Could not parse owner and repo from remote URL: "${remoteUrl}". Only GitHub repositories are supported.`);
    process.exit(1);
  }
  const owner = match[1];
  const repo = match[2];

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN or GH_TOKEN environment variable is not defined.');
    process.exit(1);
  }

  const query = `
    query GetPrThreads($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              path
              line
              comments(first: 50) {
                nodes {
                  body
                  author {
                    login
                  }
                  createdAt
                }
              }
            }
          }
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
      variables: { owner, name: repo, number: prId }
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

  const repository = result.data?.repository;
  if (!repository || !repository.pullRequest) {
    console.error(`Error: Pull request #${prId} not found in repository ${owner}/${repo}.`);
    process.exit(1);
  }

  const threads = repository.pullRequest.reviewThreads.nodes;
  const activeThreads = threads.filter(t => !t.isResolved);

  console.log(`=== ACTIVE THREADS FOR PR #${prId} IN ${owner}/${repo} ===\n`);
  if (activeThreads.length === 0) {
    console.log('No active/unresolved review threads found.');
    return;
  }

  activeThreads.forEach((thread, idx) => {
    console.log(`--- Thread #${idx + 1} ---`);
    console.log(`Thread ID: ${thread.id}`);
    console.log(`File Path: ${thread.path}`);
    console.log(`Line: ${thread.line !== null ? thread.line : 'N/A'}`);
    console.log('Comments:');
    thread.comments.nodes.forEach(comment => {
      const author = comment.author ? comment.author.login : 'unknown';
      console.log(`  [${comment.createdAt}] @${author}: ${comment.body}`);
    });
    console.log('');
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
