import { env } from '../../env.js';
import { resolveOpencodeHarnessInstructions } from './harness-instructions.js';
import { buildOpencodeMcpInstructions } from '../../mcp/mcp-prompt.js';
export function resolveServerLogEnabled() {
    const raw = env.opencodeServerLog()?.trim().toLowerCase();
    if (raw === 'false' || raw === '0' || raw === 'off')
        return false;
    return true;
}
export function resolveServerLogLevel() {
    const raw = env.opencodeLogLevel()?.trim().toUpperCase();
    if (raw === 'DEBUG' || raw === 'INFO' || raw === 'WARN' || raw === 'ERROR') {
        return raw;
    }
    return resolveServerLogEnabled() ? 'DEBUG' : undefined;
}
/** Config inline do servidor embutido (modelo, harness do projeto, sandbox read-only). */
export function buildOpencodeServerConfig(model, config) {
    const logLevel = resolveServerLogLevel();
    const mcpInstructions = config ? buildOpencodeMcpInstructions(config) : [];
    return {
        model,
        ...(logLevel ? { logLevel } : {}),
        instructions: [...resolveOpencodeHarnessInstructions(), ...mcpInstructions],
        permission: {
            edit: 'deny',
            bash: 'deny',
            webfetch: 'deny',
            external_directory: 'deny',
            doom_loop: 'deny',
        },
    };
}
//# sourceMappingURL=server-config.js.map