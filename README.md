# Shopify Admin CLI

GitOps-friendly CLI for Shopify theme management with explicit path control.

## Overview

This CLI tool provides safe, stateless access to Shopify themes for developers and teams. It focuses on theme pull and push operations with explicit directory paths, dry-run support, and mirror mode for exact synchronization in both directions.

## For Users

**[Complete User Documentation →](docs/README.md)**

For setup instructions, usage examples, and troubleshooting, see the complete documentation in the `docs/` folder.

## For Maintainers

### Quick Start

```bash
git clone https://github.com/vkhazin-befitnow/shopify-admin-cli.git
cd shopify-admin-cli
npm install
npm run build
npm link
```

### Development

```bash
npm run dev [command]  # Development mode with ts-node
npm run test          # Run tests
npm run build         # Build TypeScript to JavaScript
npm run lint          # Run linting
```

### Environment Configuration

For development and testing, create `.env/dev.sh` with:

```bash
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export SHOPIFY_TEST_THEME_NAME="TestThemeName"
```

Source the file before running tests:
```bash
source ./.env/dev.sh
npm run test
```

### Project Structure

```
├── src/
│   ├── commands/     # CLI command implementations
│   ├── utils/        # Utilities (retry, dry-run)
│   ├── settings.ts   # Configuration management
│   └── index.ts      # Main CLI entry point
├── docs/             # User documentation
├── tests/            # Test files
└── dist/             # Compiled JavaScript output
```


