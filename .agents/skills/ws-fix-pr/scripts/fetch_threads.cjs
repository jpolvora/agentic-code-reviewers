#!/usr/bin/env node
'use strict';
/**
 * Compatibility shim — forwards to ws-github-provider canonical script.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  '..',
  'ws-github-provider',
  'scripts',
  'fetch_threads.cjs'
);
const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status === null ? 1 : result.status);
