const LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
export class Logger {
    verbose;
    minLevel;
    constructor(verbose, minLevel = 'info') {
        this.verbose = verbose;
        this.minLevel = minLevel;
    }
    debug(message, ...args) {
        if (this.verbose) {
            this.write('debug', message, ...args);
        }
    }
    info(message, ...args) {
        this.write('info', message, ...args);
    }
    warn(message, ...args) {
        this.write('warn', message, ...args);
    }
    error(message, ...args) {
        this.write('error', message, ...args);
    }
    section(title) {
        this.info('');
        this.info(`━━━ ${title} ━━━`);
    }
    write(level, message, ...args) {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) {
            return;
        }
        const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
        const writer = level === 'error' || level === 'warn' ? console.error : console.log;
        writer(prefix, message, ...args);
    }
}
export function createLogger(verbose) {
    return new Logger(verbose);
}
//# sourceMappingURL=logger.js.map