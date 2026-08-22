import { AdoProvider } from './azuredevops.js';
import { GithubProvider } from './github.js';
export function getProvider(config) {
    if (config.provider === 'github') {
        return new GithubProvider();
    }
    return new AdoProvider();
}
//# sourceMappingURL=index.js.map