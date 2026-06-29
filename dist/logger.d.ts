export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export declare class Logger {
    private readonly verbose;
    private readonly minLevel;
    constructor(verbose: boolean, minLevel?: LogLevel);
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    section(title: string): void;
    private write;
}
export declare function createLogger(verbose: boolean): Logger;
//# sourceMappingURL=logger.d.ts.map