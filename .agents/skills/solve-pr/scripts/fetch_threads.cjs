const { execSync } = require('child_process');
const fs = require('fs');

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

function summarizeThread(comments) {
  const first = comments[0];
  if (!first?.body) return '';
  const body = first.body.replace(/\s+/g, ' ').trim();
  return body.length > 240 ? `${body.slice(0, 237)}...` : body;
}

async function main() {
  loadDotEnv();

  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const prIdStr = args.find((a) => a !== '--json');

  if (!prIdStr) {
    console.error('Usage: node fetch_threads.cjs <PR_ID> [--json]');
    process.exit(1);
  }

  const prId = parseInt(prIdStr, 10);
  if (Number.isNaN(prId)) {
    console.error('Error: Pull request ID must be an integer.');
    process.exit(1);
  }

  let remoteUrl;
  try {
    remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  } catch {
    console.error('Error: Could not retrieve git remote URL.');
    process.exit(1);
  }

  const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^.]+)/);
  if (!match) {
    console.error(`Error: Only GitHub repositories are supported (${remoteUrl}).`);
    process.exit(1);
  }
  const owner = match[1];
  const repo = match[2];

  const token = resolveToken();
  if (!token) {
    console.error(
      'Error: Set AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN, GITHUB_TOKEN, or GH_TOKEN.',
    );
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
                  author { login }
                  createdAt
                }
              }
            }
          }
        }
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
    body: JSON.stringify({ query, variables: { owner, name: repo, number: prId } }),
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

  const pr = result.data?.repository?.pullRequest;
  if (!pr) {
    console.error(`PR #${prId} not found in ${owner}/${repo}.`);
    process.exit(1);
  }

  const activeThreads = pr.reviewThreads.nodes.filter((t) => !t.isResolved);

  const normalized = activeThreads.map((t, idx) => ({
    index: idx + 1,
    threadId: t.id,
    filePath: t.path.startsWith('/') ? t.path : `/${t.path}`,
    lineNumber: t.line ?? 0,
    summary: summarizeThread(t.comments.nodes),
    comments: t.comments.nodes.map((c) => ({
      author: c.author?.login ?? 'unknown',
      createdAt: c.createdAt,
      body: c.body,
    })),
  }));

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          prNumber: prId,
          owner,
          repo,
          cooperativeContract: 'skills/COOPERATIVE_FIX.md',
          activeThreads: normalized,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`=== ACTIVE REVIEW THREADS (cooperative-fix) PR #${prId} ${owner}/${repo} ===\n`);

  if (normalized.length === 0) {
    console.log('No active unresolved review threads found.');
    return;
  }

  for (const t of normalized) {
    console.log(`--- Thread #${t.index} ---`);
    console.log(`Thread ID: ${t.threadId}`);
    console.log(`File Path: ${t.filePath}`);
    console.log(`Line: ${t.lineNumber || 'N/A'}`);
    console.log(`Summary: ${t.summary}`);
    console.log('Comments:');
    for (const c of t.comments) {
      console.log(`  [${c.createdAt}] @${c.author}: ${c.body.split('\n')[0]}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
