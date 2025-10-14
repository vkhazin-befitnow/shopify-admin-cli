# Configuration Constants and Magic Numbers

This document catalogs all configuration constants and magic numbers used throughout the Shopify Admin CLI codebase, explaining their purpose and rationale.

## API Configuration

### Shopify API Version
**Location**: `src/settings.ts:11`
```typescript
VERSION: '2023-10'
```
**Usage**: Shopify Admin API version for REST endpoints
**Rationale**: Using stable 2023-10 API version for compatibility

### GraphQL API Version (Auth)
**Location**: `src/commands/auth.ts:29`
```typescript
const apiVersion = '2025-01';
```
**Usage**: GraphQL API version for authentication validation
**Rationale**: Using newer 2025-01 for enhanced auth features
**⚠️ INCONSISTENCY**: Different from REST API version (2023-10)

## Retry and Rate Limiting Configuration

### RetryUtility Default Configuration
**Location**: `src/utils/retry.ts:19-27`

#### maxAttempts: 5
**Usage**: Maximum number of retry attempts for failed requests
**Rationale**: Balances reliability with reasonable timeout (5 attempts = ~63 seconds with exponential backoff)

#### baseDelayMs: 1000
**Usage**: Initial delay in milliseconds before first retry
**Rationale**: 1 second provides reasonable starting point for exponential backoff

#### maxDelayMs: 30000
**Usage**: Maximum delay cap in milliseconds (30 seconds)
**Rationale**: Prevents exponential backoff from creating excessively long waits

#### backoffMultiplier: 2
**Usage**: Multiplier for exponential backoff calculation
**Rationale**: Standard 2x multiplier (delays: 1s, 2s, 4s, 8s, 16s)

#### rateLimitMs: 0
**Usage**: Default rate limiting delay between requests
**Rationale**: No rate limiting by default (overridden by SHOPIFY_API.RETRY_CONFIG)
**⚠️ CONFLICT**: SHOPIFY_API.RETRY_CONFIG sets this to 400ms

### SHOPIFY_API Retry Configuration
**Location**: `src/settings.ts:23-28`

#### maxAttempts: 3
**Usage**: Maximum retry attempts for Shopify API calls
**Rationale**: More conservative than RetryUtility default (3 vs 5)
**⚠️ INCONSISTENCY**: Different from RetryUtility default

#### baseDelayMs: 1000
**Usage**: Initial retry delay (1 second)
**Rationale**: Consistent with RetryUtility default

#### maxDelayMs: 10000
**Usage**: Maximum delay cap (10 seconds)
**Rationale**: More aggressive than RetryUtility default (10s vs 30s)
**⚠️ INCONSISTENCY**: Different from RetryUtility default

#### rateLimitMs: 400
**Usage**: Rate limiting delay between Shopify API requests (400ms)
**Rationale**: Allows ~2.5 requests/second, safely under Shopify's rate limit
**⚠️ CONFLICT**: Overrides RetryUtility default of 0ms

### Deprecated Rate Limit Constants
**Location**: `src/utils/retry.ts:33-37`

#### SHOPIFY_API: 600
**Usage**: 600ms between calls (~1.6 calls/second)
**Status**: DEPRECATED - Use rateLimitMs in RetryOptions instead
**Rationale**: Conservative rate to stay under Shopify's 2 calls/sec limit

#### CONSERVATIVE: 1000
**Usage**: 1 second between calls for strict APIs
**Status**: DEPRECATED

#### AGGRESSIVE: 200
**Usage**: 200ms for APIs with higher limits
**Status**: DEPRECATED

## HTTP Status Codes

### Retryable Status Codes
**Location**: `src/utils/retry.ts:24`
```typescript
retryableStatusCodes: [408, 429, 500, 502, 503, 504]
```

- **408**: Request Timeout - temporary network issue
- **429**: Too Many Requests - rate limit exceeded
- **500**: Internal Server Error - temporary server issue
- **502**: Bad Gateway - temporary proxy issue
- **503**: Service Unavailable - temporary server overload
- **504**: Gateway Timeout - temporary proxy timeout

### Non-Retryable Status Codes
**Locations**: Throughout codebase

#### 401 Unauthorized
**Usage**: Invalid credentials or expired token
**Action**: Fail immediately, no retry

#### 403 Forbidden
**Usage**: Missing required API scopes/permissions
**Action**: Fail immediately, no retry

#### 404 Not Found
**Usage**: Resource doesn't exist
**Action**: Fail immediately, no retry (except in delete operations where it's acceptable)

## Pagination Limits

### GraphQL Query Pagination
**Location**: `src/commands/files.ts:178`
```typescript
const perPage = 250;
```
**Usage**: Number of files to fetch per GraphQL query page
**Rationale**: Shopify GraphQL API maximum is 250 items per page

**Location**: `src/commands/menus.ts:58`
```typescript
menus(first: 250)
```
**Usage**: Number of menus to fetch in single query
**Rationale**: Shopify GraphQL API maximum

**Location**: `src/commands/metaobjects.ts:268, 330`
```typescript
metaobjectDefinitions(first: 250)
// and
first: maxCount || 250
```
**Usage**: Number of metaobject definitions/instances to fetch
**Rationale**: Shopify GraphQL API maximum

## UI/Display Constants

### Progress Display Limit
**Location**: `src/utils/dry-run.ts:54-56`
```typescript
stats.deleteList.slice(0, 10)
if (stats.deleteList.length > 10)
```
**Usage**: Show first 10 items in delete list, then summarize rest
**Rationale**: Prevents console spam while providing useful preview

### Separator Line Length
**Location**: `src/index.ts:276, 340, 369, 433`
```typescript
'='.repeat(80)
```
**Usage**: 80-character separator lines for visual organization
**Rationale**: Standard terminal width for readability

## Configuration Conflicts Summary

### ⚠️ HIGH PRIORITY CONFLICTS

1. **Rate Limiting Configuration**
   - RetryUtility default: `rateLimitMs: 0`
   - SHOPIFY_API.RETRY_CONFIG: `rateLimitMs: 400`
   - **Impact**: Inconsistent rate limiting behavior
   - **Recommendation**: Align defaults or document override pattern

2. **Max Retry Attempts**
   - RetryUtility default: `maxAttempts: 5`
   - SHOPIFY_API.RETRY_CONFIG: `maxAttempts: 3`
   - **Impact**: Different retry behavior for Shopify vs generic operations
   - **Recommendation**: Document why Shopify needs fewer retries

3. **Max Delay**
   - RetryUtility default: `maxDelayMs: 30000` (30 seconds)
   - SHOPIFY_API.RETRY_CONFIG: `maxDelayMs: 10000` (10 seconds)
   - **Impact**: Different timeout behavior
   - **Recommendation**: Document rationale for shorter Shopify timeout

4. **API Version Inconsistency**
   - REST API: `2023-10`
   - GraphQL Auth: `2025-01`
   - **Impact**: Potential compatibility issues
   - **Recommendation**: Align versions or document why different

## Recommendations

### Immediate Actions
1. Create centralized `CONSTANTS` object in settings.ts for all magic numbers
2. Add inline comments explaining rationale for each value
3. Resolve rate limiting configuration conflict
4. Document API version differences

### Example Improved Structure
```typescript
export const CONSTANTS = {
  PAGINATION: {
    GRAPHQL_MAX_ITEMS: 250, // Shopify GraphQL API maximum per page
  },
  DISPLAY: {
    DELETE_LIST_PREVIEW: 10, // Show first N items before summarizing
    SEPARATOR_WIDTH: 80, // Standard terminal width
  },
  API_VERSIONS: {
    REST: '2023-10', // Stable REST API version
    GRAPHQL_AUTH: '2025-01', // Enhanced auth features
  }
};