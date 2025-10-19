# Test Suite

Authentication tests with real API calls (no mocks).

## Setup

Create `.env/dev.sh` in the project root with test store credentials:

```bash
export SHOPIFY_STORE_DOMAIN="your-dev-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export SHOPIFY_TEST_THEME_NAME="TestThemeName"
```

**Important**: Use a development/test store, not production.

## Running Tests

```bash
source ./.env/dev.sh  # Load test environment
npm run test          # Run all tests
```

## Test Coverage

### Authentication Tests (auth.test.ts)
- Environment setup validation
- Authentication flows (env vars + interactive)
- Invalid credential handling
- Store listing and credential persistence

### Theme Tests (themes.test.ts)
- Theme pull/push operations
- Published theme handling
- Mirror mode functionality

### Pages Tests (pages.test.ts)
- Page pull/push operations
- Page file parsing

### Multi-Component Tests (index.test.ts)
- Component validation (theme, pages)
- Pull component orchestration
- Push component orchestration

## Expected Output

```
🧪 Shopify Auth Test Suite

[PASS] Environment Setup Validation (15ms)
[PASS] Environment Authentication (1250ms)
[PASS] Interactive Authentication (890ms)
[PASS] Invalid Credentials Handling (2100ms)
[PASS] List Stores (45ms)
[PASS] Load Credentials (35ms)
[PASS] Credentials Persistence (25ms)

📊 Test Summary
Total: 7 | Passed: 7 | Failed: 0
```

## Troubleshooting

**Missing env vars**: Verify variables per root [README.md](../README.md)
**Invalid credentials**: Check private app setup and API scopes
