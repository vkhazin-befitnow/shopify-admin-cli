import { RetryUtility } from './retry';
import { SHOPIFY_API } from '../settings';

/**
 * Shared HTTP client for making requests to Shopify APIs
 * with built-in retry logic and error handling
 */
export class HttpClient {
    /**
     * Make an HTTP request with retry logic and standardized error handling
     * 
     * @param url - The URL to request
     * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
     * @param options - Request options
     * @returns Response object
     */
    async request(
        url: string,
        method: string,
        options: {
            body?: any;
            headers?: Record<string, string>;
            resourceType?: string;
        } = {}
    ): Promise<Response> {
        const { body, headers = {}, resourceType } = options;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: body && method !== 'DELETE' ? JSON.stringify(body) : undefined
            });

            if (response.status === 401) {
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                const scopeHint = resourceType ? this.getScopeHint(resourceType) : '';
                throw new Error(`Forbidden: missing required permissions${scopeHint}`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            return response;
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    /**
     * Get helpful scope hint based on resource type
     */
    private getScopeHint(resourceType: string): string {
        const scopeHints: Record<string, string> = {
            'themes': '. Ensure your app has read_themes and write_themes scopes',
            'pages': '. Ensure your app has read_online_store_pages and write_online_store_pages scopes',
            'files': '. Ensure your app has read_files and write_files scopes'
        };
        return scopeHints[resourceType] || '';
    }
}
