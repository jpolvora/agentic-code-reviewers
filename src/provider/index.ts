import type { ReviewerConfig } from '../config.js';
import type { PlatformProvider } from './types.js';
import { AdoProvider } from './azuredevops.js';
import { GithubProvider } from './github.js';

export function getProvider(config: ReviewerConfig): PlatformProvider {
  if (config.provider === 'github') {
    return new GithubProvider();
  }
  return new AdoProvider();
}

export type { PlatformProvider };
