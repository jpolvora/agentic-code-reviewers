'use strict';

const fs = require('fs');
const path = require('path');

const IMPLEMENTED = new Set(['Implemented', 'ImplementedDifferently']);

function countsFromLedger(ledger) {
  const rows = Array.isArray(ledger?.acceptanceCriteria) ? ledger.acceptanceCriteria : [];
  return {
    acTotal: rows.length,
    acImplemented: rows.filter((row) => IMPLEMENTED.has(row.status)).length,
  };
}

function syncAcCountsFromLedger(target, usDir) {
  const ledgerFile = path.join(usDir, 'ac-ledger.json');
  if (!fs.existsSync(ledgerFile) || !target || typeof target !== 'object') return target;
  try {
    const counts = countsFromLedger(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')));
    target.acTotal = counts.acTotal;
    target.acImplemented = counts.acImplemented;
  } catch {
    /* keep existing counts when ledger is unreadable */
  }
  return target;
}

module.exports = { countsFromLedger, syncAcCountsFromLedger };
