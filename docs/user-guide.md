# Shopify Admin CLI User Guide

## Overview

The Shopify Admin CLI is a comprehensive command-line tool for Shopify store asset management with GitHub integration. It provides access to all store assets that can be downloaded and persisted in a git repository.

This CLI is designed for **Shopify Partners and developers only**.

## Usage

```bash
shopify-admin [command] [options]
```

## Available Commands

### help
Display this user guide.

```bash
shopify-admin help
```

### Authentication

#### auth login
Authenticate with a specific Shopify store using private app credentials.

**Environment Variables (Recommended)**
```bash
export SHOPIFY_STORE_DOMAIN="mystore.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
shopify-admin auth login
```

**Interactive Mode**
```bash
shopify-admin auth login --site mystore.myshopify.com --access-token shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Requirements:**
- Create a private app in your Shopify store admin (see [README.md](../README.md) for detailed setup)
- Install the app and copy the Admin API access token (starts with `shpat_`)
- Credentials are securely saved to `./.shopify-admin-cli/{store-name}` for future use
- Each store requires separate authentication

#### auth list
List all authenticated stores.

```bash
shopify-admin auth list
```

#### auth status
Check authentication status for a specific store.

```bash
shopify-admin auth status --site mystore.myshopify.com
```

## Setup

For detailed setup instructions including Shopify private app creation and environment variable configuration, see the [README.md](../README.md) in the project root.

## Getting Started

1. Set up your environment variables (see [README.md](../README.md) for setup instructions)
2. Run `shopify-admin auth login` to authenticate with a store
3. Use `shopify-admin auth list` to see authenticated stores
4. Use `shopify-admin help` to see available commands

## Authentication Methods

### Environment Variables (Recommended for CI/CD)
```bash
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
source ./.env/dev.sh  # if using a file
shopify-admin auth login
```

### Command Line Parameters
```bash
shopify-admin auth login --site your-store.myshopify.com --access-token shpat_xxxxx
```

### Interactive Prompts
```bash
shopify-admin auth login
# You'll be prompted for store domain and access token
```

## Multiple Stores

To work with multiple stores, use prefixed environment variables:
```bash
export SHOPIFY_STORE1_DOMAIN="store1.myshopify.com"
export SHOPIFY_STORE1_ACCESS_TOKEN="shpat_store1_token"
export SHOPIFY_STORE2_DOMAIN="store2.myshopify.com"
export SHOPIFY_STORE2_ACCESS_TOKEN="shpat_store2_token"
```

## Troubleshooting

### Authentication Issues

**"Invalid credentials or API access denied"**
- Verify your access token starts with `shpat_`
- Ensure the private app is installed in your Shopify store
- Check that required API scopes are enabled (see [README.md](../README.md))
- Verify the store domain format: `your-store.myshopify.com`

**"No authenticated stores found"**
- Run `shopify-admin auth login` first
- Check if environment variables are set correctly
- Verify credentials files exist in `./.shopify-admin-cli/`

### General Tips

**Environment Variables Not Loading**
```bash
# Make sure to source your environment file
source ./.env/dev.sh
# Or export variables manually
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxx"
```

**Check Authentication Status**
```bash
shopify-admin auth list     # See all authenticated stores
shopify-admin auth status --site your-store.myshopify.com  # Check specific store
```

**Reset Authentication**
```bash
# Remove stored credentials and re-authenticate
rm -rf ./.shopify-admin-cli/
shopify-admin auth login
```
