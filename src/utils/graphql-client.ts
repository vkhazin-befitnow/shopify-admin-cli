import { RetryUtility } from './retry';
import { SHOPIFY_API } from '../settings';

/**
 * GraphQL response structure from Shopify API
 */
export interface GraphQLResponse<T = any> {
    data: T;
    errors?: Array<{
        message: string;
        locations?: Array<{ line: number; column: number }>;
        path?: string[];
    }>;
}

/**
 * GraphQL Client for Shopify Admin API
 * 
 * Provides centralized GraphQL request handling with:
 * - Automatic retry logic
 * - Consistent error handling
 * - HTTP status code validation
 * - GraphQL error detection
 */
export class GraphQLClient {
    /**
     * Execute a GraphQL query or mutation with automatic retry and error handling
     * 
     * @param site - Shopify store domain (e.g., 'mystore.myshopify.com')
     * @param accessToken - Shopify Admin API access token
     * @param query - GraphQL query or mutation string
     * @param variables - Optional variables for the query/mutation
     * @param resourceType - Resource type for error messages (e.g., 'menus', 'files')
     * @returns GraphQL response with data and potential errors
     * @throws Error if HTTP request fails or GraphQL returns errors
     */
    static async request<T = any>(
        site: string,
        accessToken: string,
        query: string,
        variables?: Record<string, any>,
        resourceType: string = 'resource'
    ): Promise<GraphQLResponse<T>> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query, variables })
            });

            // Handle HTTP errors
            if (response.status === 401) {
                throw new Error(
                    `Failed to execute GraphQL request for ${resourceType}: ` +
                    `Unauthorized - invalid access token or store domain. Verify your credentials.`
                );
            }

            if (response.status === 403) {
                throw new Error(
                    `Failed to execute GraphQL request for ${resourceType}: ` +
                    `Forbidden - missing required permissions. Check your app scopes.`
                );
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to execute GraphQL request for ${resourceType}: ` +
                    `API request failed (${response.status})${errorText ? ': ' + errorText : ''}`
                );
            }

            const result: GraphQLResponse<T> = await response.json();

            // Handle GraphQL errors
            if (result.errors && result.errors.length > 0) {
                throw new Error(
                    `GraphQL errors for ${resourceType}: ` +
                    JSON.stringify(result.errors.map(e => e.message))
                );
            }

            return result;
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    /**
     * Execute a GraphQL mutation
     * 
     * Convenience method that extracts the data from the response.
     * Use this for mutations where you expect a successful result.
     * 
     * @param site - Shopify store domain
     * @param accessToken - Shopify Admin API access token
     * @param mutation - GraphQL mutation string
     * @param variables - Variables for the mutation
     * @param resourceType - Resource type for error messages
     * @returns The data portion of the GraphQL response
     */
    static async mutation<T = any>(
        site: string,
        accessToken: string,
        mutation: string,
        variables?: Record<string, any>,
        resourceType: string = 'resource'
    ): Promise<T> {
        const response = await this.request<T>(
            site,
            accessToken,
            mutation,
            variables,
            resourceType
        );

        return response.data;
    }

    /**
     * Execute a GraphQL query
     * 
     * Convenience method that extracts the data from the response.
     * Use this for queries where you expect a successful result.
     * 
     * @param site - Shopify store domain
     * @param accessToken - Shopify Admin API access token
     * @param query - GraphQL query string
     * @param variables - Variables for the query
     * @param resourceType - Resource type for error messages
     * @returns The data portion of the GraphQL response
     */
    static async query<T = any>(
        site: string,
        accessToken: string,
        query: string,
        variables?: Record<string, any>,
        resourceType: string = 'resource'
    ): Promise<T> {
        const response = await this.request<T>(
            site,
            accessToken,
            query,
            variables,
            resourceType
        );

        return response.data;
    }
}