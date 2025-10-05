/**
 * Tests for the retry utility
 */

import { strict as assert } from 'assert';
import { RetryUtility, RetryOptions } from '../src/utils/retry';

// Test helper to create functions that fail a certain number of times
function createFailingFunction(failCount: number, errorMessage = 'Test error'): () => Promise<string> {
    let attemptCount = 0;
    return async () => {
        attemptCount++;
        if (attemptCount <= failCount) {
            throw new Error(errorMessage);
        }
        return `Success on attempt ${attemptCount}`;
    };
}

// Test helper to create functions that fail with specific status codes
function createHttpErrorFunction(statusCode: number, failCount: number): () => Promise<string> {
    let attemptCount = 0;
    return async () => {
        attemptCount++;
        if (attemptCount <= failCount) {
            throw new Error(`API request failed: ${statusCode}`);
        }
        return `Success on attempt ${attemptCount}`;
    };
}

async function testBasicRetry() {
    console.log('Testing basic retry functionality...');

    // Function that fails twice then succeeds
    const fn = createFailingFunction(2);

    const result = await RetryUtility.withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 10, // Fast for testing
        retryableErrors: ['Test error'] // Make test errors retryable
    });

    assert.equal(result, 'Success on attempt 3');
    console.log('Basic retry test passed');
}

async function testRetryExhaustion() {
    console.log('Testing retry exhaustion...');

    // Function that always fails
    const fn = createFailingFunction(10, 'Persistent error');

    try {
        await RetryUtility.withRetry(fn, {
            maxAttempts: 3,
            baseDelayMs: 10,
            retryableErrors: ['Persistent error'] // Make test errors retryable
        });
        assert.fail('Expected error to be thrown');
    } catch (error: any) {
        assert.equal(error.message, 'Persistent error');
    }

    console.log('Retry exhaustion test passed');
}

async function testRetryableStatusCodes() {
    console.log('Testing retryable status codes...');

    // Test 429 (rate limit) - should retry
    const rateLimitFn = createHttpErrorFunction(429, 1);
    const result429 = await RetryUtility.withRetry(rateLimitFn, {
        maxAttempts: 3,
        baseDelayMs: 10
    });
    assert.equal(result429, 'Success on attempt 2');

    // Test 404 (not found) - should not retry by default
    const notFoundFn = createHttpErrorFunction(404, 1);
    try {
        await RetryUtility.withRetry(notFoundFn, {
            maxAttempts: 3,
            baseDelayMs: 10
        });
        assert.fail('Expected error to be thrown');
    } catch (error: any) {
        assert(error.message.includes('404'));
    }

    console.log('Status code tests passed');
}

async function testCustomRetryableErrors() {
    console.log('Testing custom retryable errors...');

    const options: RetryOptions = {
        maxAttempts: 3,
        baseDelayMs: 10,
        retryableStatusCodes: [404], // Make 404 retryable
        retryableErrors: ['CUSTOM_ERROR']
    };

    // Test custom status code
    const notFoundFn = createHttpErrorFunction(404, 1);
    const result404 = await RetryUtility.withRetry(notFoundFn, options);
    assert.equal(result404, 'Success on attempt 2');

    // Test custom error code
    const customErrorFn = () => {
        const error: any = new Error('Custom error occurred');
        error.code = 'CUSTOM_ERROR';
        throw error;
    };

    let attemptCount = 0;
    const customFn = async () => {
        attemptCount++;
        if (attemptCount === 1) {
            return customErrorFn();
        }
        return 'Success';
    };

    const customResult = await RetryUtility.withRetry(customFn, options);
    assert.equal(customResult, 'Success');

    console.log('Custom retryable errors test passed');
}


async function testExponentialBackoff() {
    console.log('Testing exponential backoff timing...');

    const fn = createFailingFunction(3);
    const startTime = Date.now();

    await RetryUtility.withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 100,
        backoffMultiplier: 2,
        retryableErrors: ['Test error'] // Make test errors retryable
    });

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Should have delays of ~100ms, ~200ms, ~400ms
    // With jitter, should be at least 300ms total
    assert(totalTime >= 300, `Expected at least 300ms, got ${totalTime}ms`);
    assert(totalTime < 1000, `Expected less than 1000ms, got ${totalTime}ms`);

    console.log('Exponential backoff test passed');
}

async function testRateLimited() {
    console.log('Testing rate limited function...');

    let callCount = 0;
    const testFn = async (value: string) => {
        callCount++;
        return `Called ${callCount} times with ${value}`;
    };

    const rateLimitedFn = RetryUtility.rateLimited(testFn, 50);

    const startTime = Date.now();

    // Call functions sequentially to test rate limiting
    const result1 = await rateLimitedFn('first');
    const result2 = await rateLimitedFn('second');
    const result3 = await rateLimitedFn('third');

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Should have taken at least 100ms (2 delays of 50ms each)
    assert(totalTime >= 100, `Expected at least 100ms, got ${totalTime}ms`);

    assert.equal(result1, 'Called 1 times with first');
    assert.equal(result2, 'Called 2 times with second');
    assert.equal(result3, 'Called 3 times with third');

    console.log('Rate limited function test passed');
}

async function testMaxDelayLimit() {
    console.log('Testing maximum delay limit...');

    const fn = createFailingFunction(1);
    const startTime = Date.now();

    await RetryUtility.withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 100, // Cap delay at 100ms
        backoffMultiplier: 10, // Would normally create very long delays
        retryableErrors: ['Test error'] // Make test errors retryable
    });

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Should be capped at maxDelayMs, so total time should be reasonable
    assert(totalTime < 500, `Expected less than 500ms, got ${totalTime}ms`);

    console.log('Maximum delay limit test passed');
}

// Run all tests
async function runTests() {
    console.log('Running retry utility tests...\n');

    try {
        await testBasicRetry();
        await testRetryExhaustion();
        await testRetryableStatusCodes();
        await testCustomRetryableErrors();
        await testExponentialBackoff();
        await testRateLimited();
        await testMaxDelayLimit();

        // Test rate limit constants accessibility
        try {
            console.log('Testing rate limit constants...');

            assert(typeof RetryUtility.RATE_LIMITS.SHOPIFY_API === 'number');
            assert(RetryUtility.RATE_LIMITS.SHOPIFY_API === 600);
            assert(typeof RetryUtility.RATE_LIMITS.CONSERVATIVE === 'number');
            assert(typeof RetryUtility.RATE_LIMITS.AGGRESSIVE === 'number');

            console.log('Rate limit constants test passed');
        } catch (error: any) {
            throw new Error(`Rate limit constants test failed: ${error.message}`);
        }

        console.log('\nAll retry utility tests passed!');
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

runTests();
