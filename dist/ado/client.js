import { DEFAULT_HTTP_MAX_RETRIES, isJwtAccessToken, isRetryableHttpStatus, parseRetryAfterSeconds, sleepBackoff, truncateResponseText, } from '../http-retry.js';
export class AdoClient {
    organization;
    project;
    repositoryName;
    accessToken;
    constructor(organization, project, repositoryName, accessToken) {
        this.organization = organization;
        this.project = project;
        this.repositoryName = repositoryName;
        this.accessToken = accessToken;
    }
    get baseUrl() {
        const org = encodeURIComponent(this.organization);
        const project = encodeURIComponent(this.project);
        const repo = encodeURIComponent(this.repositoryName);
        return `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}`;
    }
    async get(path) {
        return this.request('GET', path);
    }
    async post(path, body) {
        return this.request('POST', path, body);
    }
    async patch(path, body) {
        return this.request('PATCH', path, body);
    }
    async getConnectionData() {
        const org = encodeURIComponent(this.organization);
        const url = `https://dev.azure.com/${org}/_apis/connectionData`;
        const response = await fetch(url, { headers: this.headers() });
        if (!response.ok) {
            throw new Error(`ADO connectionData failed: ${response.status} ${truncateResponseText(await response.text())}`);
        }
        return response.json();
    }
    headers() {
        const authHeader = isJwtAccessToken(this.accessToken)
            ? `Bearer ${this.accessToken}`
            : `Basic ${Buffer.from(`:${this.accessToken}`).toString('base64')}`;
        return {
            Authorization: authHeader,
            'Content-Type': 'application/json',
        };
    }
    async request(method, path, body) {
        const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
        const maxRetries = DEFAULT_HTTP_MAX_RETRIES;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            let response;
            try {
                response = await fetch(url, {
                    method,
                    headers: this.headers(),
                    body: body === undefined ? undefined : JSON.stringify(body),
                });
            }
            catch (networkError) {
                lastError = new Error(`ADO ${method} ${url} network error: ${String(networkError)}`);
                if (attempt === maxRetries) {
                    throw lastError;
                }
                await sleepBackoff(attempt);
                continue;
            }
            if (response.ok) {
                if (response.status === 204) {
                    return undefined;
                }
                return response.json();
            }
            const text = truncateResponseText(await response.text());
            lastError = new Error(`ADO ${method} ${url} failed: ${response.status} ${text}`);
            if (!isRetryableHttpStatus(response.status) || attempt === maxRetries) {
                throw lastError;
            }
            const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
            await sleepBackoff(attempt, retryAfterSeconds);
        }
        throw lastError ?? new Error(`ADO ${method} ${url} failed after ${maxRetries} retries`);
    }
}
//# sourceMappingURL=client.js.map