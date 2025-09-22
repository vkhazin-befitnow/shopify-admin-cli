# Shopify Admin CLI

Comprehensive CLI for Shopify store asset management with GitHub integration.

## Overview

This CLI tool provides comprehensive access to Shopify store assets for developers and Shopify Partners. It enables downloading, managing, and version controlling all store assets including themes, content, products, and configurations.

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

### Project Structure

```
├── src/
│   ├── commands/     # CLI command implementations
│   ├── lib/          # Core authentication and utilities
│   └── index.ts      # Main CLI entry point
├── docs/             # User documentation
├── tests/            # Test files
└── theme/            # Theme templates (if any)
```


