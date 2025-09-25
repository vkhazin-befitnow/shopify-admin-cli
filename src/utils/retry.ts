/**
 * Retry utility with exponential backoff for handling API rate limits
 * and transient network errors
 */

export interface RetryOptions {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableStatusCodes?: number[];
    retryableErrors?: string[];
}

export interface RetryResult<T> {
    success: boolean;
    data?: T;
    error?: Error;
    attempts: number;
    totalDelayMs: number;
}

export class RetryUtility {
    private static readonly DEFAULT_OPTIONS: Required<RetryOptions> = {
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
        retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT']
    };

    /**
     * Standard rate limit delays for common APIs
     */
    static readonly RATE_LIMITS = {
        SHOPIFY_API: 600, // 600ms between calls (roughly 1.6 calls per second, under Shopify's 2 calls/sec limit)
        CONSERVATIVE: 1000, // 1 second between calls for very strict APIs
        AGGRESSIVE: 200 // 200ms for APIs with higher limits
    } as const;

    /**
     * Execute a function with exponential backoff retry
     */
    static async withRetry<T>(
        fn: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<T> {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        let lastError: Error | null = null;
        let totalDelayMs = 0;

        for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;

                // Don't retry on last attempt
                if (attempt === opts.maxAttempts) {
                    break;
                }

                // Check if error is retryable
                if (!this.isRetryableError(error, opts)) {
                    break;
                }

                // Calculate delay with exponential backoff
                const delay = this.calculateDelay(attempt, opts);
                totalDelayMs += delay;

                console.warn(`Attempt ${attempt}/${opts.maxAttempts} failed: ${error.message}. Retrying in ${delay}ms...`);

                await this.sleep(delay);
            }
        }

        throw lastError || new Error('Unknown error during retry');
    }

    /**
     * Execute a function with retry and return detailed result
     */
    static async withRetryDetailed<T>(
        fn: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<RetryResult<T>> {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        let lastError: Error | null = null;
        let totalDelayMs = 0;

        for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
            try {
                const data = await fn();
                return {
                    success: true,
                    data,
                    attempts: attempt,
                    totalDelayMs
                };
            } catch (error: any) {
                lastError = error;

                // Don't retry on last attempt
                if (attempt === opts.maxAttempts) {
                    break;
                }

                // Check if error is retryable
                if (!this.isRetryableError(error, opts)) {
                    break;
                }

                // Calculate delay with exponential backoff
                const delay = this.calculateDelay(attempt, opts);
                totalDelayMs += delay;

                await this.sleep(delay);
            }
        }

        return {
            success: false,
            error: lastError || new Error('Unknown error during retry'),
            attempts: opts.maxAttempts,
            totalDelayMs
        };
    }

    /**
     * Check if an error is retryable based on configuration
     */
    private static isRetryableError(error: any, options: Required<RetryOptions>): boolean {
        // Check for HTTP status codes
        if (error.message && typeof error.message === 'string') {
            // Extract status code from error message (e.g., "API request failed: 429")
            const statusMatch = error.message.match(/(\d{3})/);
            if (statusMatch) {
                const statusCode = parseInt(statusMatch[1]);
                if (options.retryableStatusCodes.includes(statusCode)) {
                    return true;
                }
            }
        }

        // Check for network error codes
        if (error.code && options.retryableErrors.includes(error.code)) {
            return true;
        }

        // Check for fetch-related errors
        if (error.message && error.message.includes('fetch')) {
            return true;
        }

        // For basic errors without specific codes, retry by default
        // This allows generic network issues and temporary failures to be retried
        if (!error.code && (!error.message || !error.message.match(/(\d{3})/))) {
            return true;
        }

        return false;
    }

    /**
     * Calculate delay with exponential backoff and jitter
     */
    private static calculateDelay(attempt: number, options: Required<RetryOptions>): number {
        // Exponential backoff: baseDelay * (multiplier ^ (attempt - 1))
        const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.1 * exponentialDelay;

        // Cap at maximum delay
        const delay = Math.min(exponentialDelay + jitter, options.maxDelayMs);

        return Math.round(delay);
    }

    /**
     * Sleep for specified milliseconds
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a rate-limited version of a function
     * Useful for API calls that have strict rate limits
     */
    static rateLimited<T extends any[], R>(
        fn: (...args: T) => Promise<R>,
        delayMs: number
    ): (...args: T) => Promise<R> {
        let lastCallTime = 0;

        return async (...args: T): Promise<R> => {
            const now = Date.now();
            const timeSinceLastCall = now - lastCallTime;

            if (timeSinceLastCall < delayMs) {
                const waitTime = delayMs - timeSinceLastCall;
                await this.sleep(waitTime);
            }

            lastCallTime = Date.now();
            return fn(...args);
        };
    }
}