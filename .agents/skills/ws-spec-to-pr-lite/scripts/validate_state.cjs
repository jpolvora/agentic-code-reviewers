#!/usr/bin/env node
'use strict';

const { runValidateCli } = require('../../ws-shared/scripts/workflow_state.cjs');

runValidateCli({
  pipeline: 'lite',
  maxStep: 5,
  labels: ['Spec', 'Planning', 'Implementation', 'Code review', 'Consolidation', 'Ship and PR'],
  scriptFile: __filename,
});
