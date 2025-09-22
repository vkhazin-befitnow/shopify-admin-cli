# Shopify Admin CLI User Guide

## Overview

A command-line tool for Shopify store management. Supports both interactive use and CI/CD pipelines with stateless authentication.

## Quick Start

### 1. Create Private App

1. In your Shopify admin, go to Settings > Apps and sales channels > Develop apps
2. Create a new app with required scopes (see below)
3. Install the app and copy the access token (starts with `shpat_`)

### 2. Set Credentials

Choose one method:

**Environment variables** (recommended):
```bash
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**CLI arguments** (overrides environment):
```bash
shopify-admin auth validate --site your-store.myshopify.com --access-token shpat_xxxxx
```

### 3. Install CLI

```bash
git clone https://github.com/vkhazin-befitnow/shopify-admin-cli.git
cd shopify-admin-cli
npm install && npm run build && npm link
```

## Commands

### help
Show the user guide
```bash
shopify-admin help
```

### auth validate
Validate credentials and display store information
```bash
shopify-admin auth validate
```

## Required API Scopes

Configure these scopes in your private app:

**Core Content & Assets**
- `read_files`, `write_files`
- `read_content`, `write_content`
- `read_themes`, `write_themes`, `write_theme_code`

**Products & Collections**
- `read_products`, `write_products`

**Store Configuration**
- `read_online_store_navigation`, `write_online_store_navigation`
- `read_online_store_pages`, `write_online_store_pages`
- `read_script_tags`, `write_script_tags`
- `read_locales`, `write_locales`

**Advanced Features**
- `read_legal_policies`, `write_legal_policies`
- `read_metaobject_definitions`, `write_metaobject_definitions`
- `read_metaobjects`, `write_metaobjects`

## Troubleshooting

**Authentication Issues**
- Verify access token starts with `shpat_`
- Ensure private app is installed
- Check required scopes are enabled
- Use format: `your-store.myshopify.com`

**Environment Variables**
```bash
# Check current values
echo $SHOPIFY_STORE_DOMAIN $SHOPIFY_ACCESS_TOKEN

# Re-export if needed
source ./.env/dev.sh
```
