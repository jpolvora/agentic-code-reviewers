import { assertWorkspaceClean } from './uninstall-fixtures.js';
try {
    assertWorkspaceClean();
    console.log('[seed:verify-clean] OK — nenhum artefato seed no workspace.');
}
catch (error) {
    console.error(`[seed:verify-clean] FALHA\n${String(error)}`);
    process.exit(1);
}
//# sourceMappingURL=verify-clean.js.map