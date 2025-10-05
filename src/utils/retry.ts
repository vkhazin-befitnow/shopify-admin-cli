/**
 * Retry utility with exponential backoff for handling API rate limits
 * and transient network errors
 */

import { Logger } from './logger';

export interface RetryOptions {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableStatusCodes?: number[];
    retryableErrors?: string[];
    rateLimitMs?: number;
}

export class RetryUtility {
    private static readonly DEFAULT_OPTIONS: Required<RetryOptions> = {
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
        retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'],
        rateLimitMs: 0
    };

    /**
     * Standard rate limit delays for common APIs (deprecated - use rateLimitMs in RetryOptions instead)
     * @deprecated Use rateLimitMs in RetryOptions instead
     */
    static readonly RATE_LIMITS = {
        SHOPIFY_API: 600, // 600ms between calls (roughly 1.6 calls per second, under Shopify's 2 calls/sec limit)
        CONSERVATIVE: 1000, // 1 second between calls for very strict APIs
        AGGRESSIVE: 200 // 200ms for APIs with higher limits
    } as const;

    // Track last call time for rate limiting
    private static lastCallTimes = new Map<string, number>();

    /**
     * Execute a function with exponential backoff retry and automatic rate limiting
     */
    static async withRetry<T>(
        fn: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<T> {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        let lastError: Error | null = null;
        let totalDelayMs = 0;

        // Apply rate limiting before the first attempt
        if (opts.rateLimitMs > 0) {
            await this.applyRateLimit(fn.toString(), opts.rateLimitMs);
        }

        for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
            try {
                const result = await fn();

                // Update last call time after successful execution
                if (opts.rateLimitMs > 0) {
                    this.lastCallTimes.set(fn.toString(), Date.now());
                }

                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

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

                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Attempt ${attempt}/${opts.maxAttempts} failed: ${message}. Retrying in ${delay}ms...`);

                await this.sleep(delay);
            }
        }

        throw lastError || new Error('Unknown error during retry');
    }

    /**
     * Check if an error is retryable based on configuration
     */
    private static isRetryableError(error: any, options: Required<RetryOptions>): boolean {
        const errorMessage = error.message && typeof error.message === 'string' ? error.message : '';

        // Don't retry validation errors - these are permanent failures
        if (this.isValidationError(errorMessage)) {
            return false;
        }

        // Check for network error codes (connection issues) or retryable error messages
        if (error.code && options.retryableErrors.includes(error.code)) {
            return true;
        }

        // Check if error message matches any retryable error patterns
        if (errorMessage && options.retryableErrors.some(pattern => errorMessage.includes(pattern))) {
            return true;
        }

        // Check for HTTP status codes that indicate temporary issues
        if (errorMessage) {
            // Extract status code from error message (e.g., "API request failed: 429")
            const statusMatch = errorMessage.match(/(\d{3})/);
            if (statusMatch) {
                const statusCode = parseInt(statusMatch[1]);
                if (options.retryableStatusCodes.includes(statusCode)) {
                    return true;
                }
            }
        }

        // Check for fetch-related network errors
        if (errorMessage.includes('fetch') && !this.isValidationError(errorMessage)) {
            return true;
        }

        // Check for explicit timeout/connection errors
        if (errorMessage.toLowerCase().includes('timeout') ||
            errorMessage.toLowerCase().includes('connection') ||
            errorMessage.toLowerCase().includes('network')) {
            return true;
        }

        // Default to non-retryable to prevent validation errors from being retried
        return false;
    }

    /**
     * Check if an error is a validation error that should not be retried
     */
    private static isValidationError(errorMessage: string): boolean {
        if (!errorMessage) {
            return false;
        }

        // Shopify GraphQL validation error patterns
        const validationPatterns = [
            /User errors:/i,
            /page not found/i,
            /customer_account_page not found/i,
            /Couldn't create link/i,
            /Invalid.*handle/i,
            /Invalid.*specified/i,
            /already exists/i,
            /required field/i,
            /invalid.*format/i,
            /exceeds.*limit/i,
            /does not exist/i,
            /not found/i,
            /resource.*not found/i,
            /validation.*failed/i,
            /field.*is required/i,
            /must be unique/i
        ];

        return validationPatterns.some(pattern => pattern.test(errorMessage));
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
     * Apply rate limiting before function execution
     */
    private static async applyRateLimit(fnKey: string, rateLimitMs: number): Promise<void> {
        const lastCallTime = this.lastCallTimes.get(fnKey) || 0;
        const now = Date.now();
        const timeSinceLastCall = now - lastCallTime;

        if (timeSinceLastCall < rateLimitMs) {
            const waitTime = rateLimitMs - timeSinceLastCall;
            await this.sleep(waitTime);
        }
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
