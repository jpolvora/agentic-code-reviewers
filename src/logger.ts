export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  constructor(
    private readonly verbose: boolean,
    private readonly minLevel: LogLevel = 'info',
  ) {}

  debug(message: string, ...args: unknown[]): void {
    if (this.verbose) {
      this.write('debug', message, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    this.write('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.write('error', message, ...args);
  }

  section(title: string): void {
    this.info('');
    this.info(`━━━ ${title} ━━━`);
  }

  private write(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) {
      return;
    }

    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
    const writer = level === 'error' || level === 'warn' ? console.error : console.log;
    writer(prefix, message, ...args);
  }
}

export function createLogger(verbose: boolean): Logger {
  return new Logger(verbose);
}
