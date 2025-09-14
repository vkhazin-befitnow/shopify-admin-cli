# Test Suite

Authentication tests with real API calls (no mocks).

## Setup

Set environment variables as described in [root README.md](../README.md)

## Running Tests

```bash
npm run test:dev  # TypeScript mode (faster)
npm run test      # Compiled mode
```

## Test Coverage

- Environment setup validation
- Authentication flows (env vars + interactive)
- Invalid credential handling
- Store listing and credential persistence

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

