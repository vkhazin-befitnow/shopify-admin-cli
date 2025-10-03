export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

export class Logger {
    private static currentLevel: LogLevel = LogLevel.INFO;

    static setLevel(level: LogLevel): void {
        Logger.currentLevel = level;
    }

    static error(message: string, error?: Error): void {
        if (Logger.currentLevel >= LogLevel.ERROR) {
            console.error(`ERROR: ${message}`);
            if (error && Logger.currentLevel >= LogLevel.DEBUG) {
                console.error(error.stack);
            }
        }
    }

    static warn(message: string): void {
        if (Logger.currentLevel >= LogLevel.WARN) {
            console.warn(`WARNING: ${message}`);
        }
    }

    static info(message: string): void {
        if (Logger.currentLevel >= LogLevel.INFO) {
            console.log(message);
        }
    }

    static debug(message: string): void {
        if (Logger.currentLevel >= LogLevel.DEBUG) {
            console.log(`DEBUG: ${message}`);
        }
    }

    static success(message: string): void {
        if (Logger.currentLevel >= LogLevel.INFO) {
            console.log(message);
        }
    }

    static progress(current: number, total: number, item: string): void {
        if (Logger.currentLevel >= LogLevel.INFO) {
            console.log(`(${current}/${total}): ${item}`);
        }
    }
}
