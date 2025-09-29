# Shopify Admin CLI User Guide

## Overview

A command-line tool for Shopify store management. Supports both interactive use and CI/CD pipelines with stateless authentication.

## Quick Start

### Create Private App

1. In your Shopify admin, go to Settings > Apps and sales channels > Develop apps
1. Create a new app with required scopes (see below)
1. Install the app and copy the access token (starts with `shpat_`)

### Set Credentials

Two methods supported:

**Environment variables** (recommended):
```bash
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**CLI arguments** (overrides environment):
```bash
shopify-admin auth validate --site your-store.myshopify.com --access-token shpat_xxxxx
```

### Install CLI

```bash
git clone https://github.com/vkhazin-befitnow/shopify-admin-cli.git
cd shopify-admin-cli
npm install && npm run build && npm link
```

## Commands

### auth
Authentication commands for validating store credentials.

#### validate
Validate Shopify credentials and display store information with scopes.
```bash
shopify-admin auth validate
```

**Options:**
- `--site <shop>` - Shopify store domain (e.g., mystore.myshopify.com)
- `--access-token <token>` - Admin API access token (starts with shpat_)

**Examples:**
```bash
# Using environment variables
shopify-admin auth validate

# With explicit credentials
shopify-admin auth validate --site your-store.myshopify.com --access-token shpat_xxxxx
```

### themes
Theme management commands for downloading and uploading themes.

#### pull
Download a theme to an explicit directory path.
```bash
shopify-admin themes pull --name "Horizon" --output ./themes/horizon
```

**Required Options:**
- `--name <name>` - Theme name to download (e.g., "Dawn", "Horizon")
- `--output <path>` - Exact output directory path where theme files will be created

**Optional Options:**
- `--dry-run` - Show what would be changed without making actual changes
- `--mirror` - Mirror mode: delete local files not present remotely (destructive)
- `--site <shop>` - Shopify store domain (e.g., mystore.myshopify.com)
- `--access-token <token>` - Admin API access token (starts with shpat_)

**Pull Modes:**
- **Default**: Downloads all remote files to the specified directory. Existing local files are overwritten to ensure complete synchronization.
- **Mirror mode** (`--mirror`): Makes the local directory exactly match the remote theme. **This will delete local files that don't exist remotely.**

**Note**: The CLI uses a reliable "always sync" approach that ensures complete synchronization between local and remote files, prioritizing data integrity over incremental updates.

The theme will be downloaded directly to the specified path with standard Shopify theme structure (assets/, config/, layout/, etc).

**Examples:**
```bash
# Download to specific directory
shopify-admin themes pull --name "Dawn" --output ./backup/dawn

# Preview what would be downloaded
shopify-admin themes pull --name "Horizon" --output ./themes/horizon --dry-run

# Mirror remote state exactly (destructive to local files)
shopify-admin themes pull --name "Dawn" --output ./themes/dawn --mirror

# Always preview mirror mode first
shopify-admin themes pull --name "Production Theme" --output ./themes/production --mirror --dry-run

# With explicit credentials
shopify-admin themes pull --name "Horizon" --output ./themes/horizon \
  --site your-store.myshopify.com --access-token shpat_xxxxx
```

#### push
Upload theme files from an explicit directory path to store.
```bash
shopify-admin themes push --name "Horizon" --input ./themes/horizon
```

**Required Options:**
- `--name <name>` - Theme name to upload to (e.g., "Dawn", "Horizon")
- `--input <path>` - Exact input directory path containing theme files (assets/, config/, etc)

**Optional Options:**
- `--dry-run` - Show what would be changed without making actual changes
- `--mirror` - Mirror mode: delete remote files not present locally (destructive)
- `--site <shop>` - Shopify store domain (e.g., mystore.myshopify.com)
- `--access-token <token>` - Admin API access token (starts with shpat_)

**Push Modes:**
- **Default**: Uploads all local files to ensure complete synchronization. New files are uploaded and existing files are updated to match local versions.
- **Mirror mode** (`--mirror`): Makes the remote theme exactly match your local files. **This will delete remote files that don't exist locally.**

**Note**: The CLI uses a reliable "always sync" approach that ensures complete synchronization between local and remote files, prioritizing data integrity over incremental updates.

**Examples:**
```bash
# Safe upload - won't delete anything
shopify-admin themes push --name "Dawn" --input ./backup/dawn

# Preview changes first
shopify-admin themes push --name "Horizon" --input ./themes/horizon --dry-run

# Mirror local state exactly (destructive)
shopify-admin themes push --name "Dawn" --input ./themes/dawn --mirror

# Always preview mirror mode first
shopify-admin themes push --name "Production Theme" --input ./themes/production --mirror --dry-run

# With explicit credentials
shopify-admin themes push --name "Horizon" --input ./themes/horizon \
  --site your-store.myshopify.com --access-token shpat_xxxxx
```

## Safety Guidelines

### Theme Pull Safety

**Always use `--dry-run` first** when using mirror mode:
```bash
# ALWAYS preview changes first
shopify-admin themes pull --name "Live Theme" --output ./themes/live --mirror --dry-run

# Only run actual pull after reviewing what will be deleted locally
shopify-admin themes pull --name "Live Theme" --output ./themes/live --mirror
```

**Mirror Mode Warning for Pull**
- `--mirror` flag will **DELETE** local files not present remotely
- This will **permanently delete** your local changes that don't exist on the remote theme
- Use with caution when you have local modifications
- Always backup local files before using pull mirror mode

### Theme Push Safety

**Always use `--dry-run` first** when pushing to production themes:
```bash
# ALWAYS preview changes first
shopify-admin themes push --name "Live Theme" --input ./themes --mirror --dry-run

# Only run actual push after reviewing the preview
shopify-admin themes push --name "Live Theme" --input ./themes --mirror
```

**Mirror Mode Warning for Push**
- `--mirror` flag will **DELETE** remote files not present locally
- This is **irreversible** - deleted theme files cannot be recovered
- Use with extreme caution on production themes
- Always backup themes before using mirror mode

**Recommended Workflow**
1. Pull current theme to exact path: `shopify-admin themes pull --name "Live Theme" --output ./backup/live`
1. Make your changes locally
1. Preview with dry-run: `shopify-admin themes push --name "Test Theme" --input ./themes/test --dry-run`
1. Test on development theme first
1. Use mirror mode only when intentional: `--mirror --dry-run` then `--mirror`

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
