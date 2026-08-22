export declare class AdoClient {
    readonly organization: string;
    readonly project: string;
    readonly repositoryName: string;
    readonly accessToken: string;
    constructor(organization: string, project: string, repositoryName: string, accessToken: string);
    get baseUrl(): string;
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body: unknown): Promise<T>;
    patch<T>(path: string, body: unknown): Promise<T>;
    getConnectionData(): Promise<{
        authenticatedUser: {
            id: string;
            providerDisplayName: string;
        };
    }>;
    private headers;
    private request;
}
//# sourceMappingURL=client.d.ts.map