import { env } from '../../env.js';

export type OpencodeLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export function resolveServerLogEnabled(): boolean {
  const raw = env.opencodeServerLog()?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return true;
}

export function resolveServerLogLevel(): OpencodeLogLevel | undefined {
  const raw = env.opencodeLogLevel()?.trim().toUpperCase();
  if (raw === 'DEBUG' || raw === 'INFO' || raw === 'WARN' || raw === 'ERROR') {
    return raw;
  }
  return resolveServerLogEnabled() ? 'DEBUG' : undefined;
}

/** Config inline do servidor embutido (modelo + sandbox read-only). */
export function buildOpencodeServerConfig(model: string) {
  const logLevel = resolveServerLogLevel();
  return {
    model,
    ...(logLevel ? { logLevel } : {}),
    permission: {
      edit: 'deny' as const,
      bash: 'deny' as const,
      webfetch: 'deny' as const,
      external_directory: 'deny' as const,
      doom_loop: 'deny' as const,
    },
  };
}
