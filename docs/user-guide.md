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

### themes list
List all themes in the store with details
```bash
shopify-admin themes list
```

### themes pull
Download a theme to local directory
```bash
shopify-admin themes pull --name "Horizon" --output ./themes
```

The theme will be downloaded to: `./themes/themes/Horizon/`

### themes push
Upload local theme files to store
```bash
# Safe default: only upload/update files (no deletions)
shopify-admin themes push --name "Horizon" --input ./themes

# Mirror mode: make remote exactly match local (DESTRUCTIVE)
shopify-admin themes push --name "Horizon" --input ./themes --mirror

# Preview changes without applying them
shopify-admin themes push --name "Horizon" --input ./themes --dry-run
shopify-admin themes push --name "Horizon" --input ./themes --mirror --dry-run
```

**Push Modes:**
- **Default**: Only uploads new files and updates existing files. Remote files not present locally are left untouched.
- **Mirror mode** (`--mirror`): Makes the remote theme exactly match your local files. **This will delete remote files that don't exist locally.**

**Examples:**
```bash
# Safe upload - won't delete anything
shopify-admin themes push --name "Dawn" --input ./backup

# Mirror local state exactly (destructive)
shopify-admin themes push --name "Dawn" --input ./themes --mirror

# Always preview first with dry-run
shopify-admin themes push --name "Production Theme" --input ./themes --mirror --dry-run

# With explicit credentials
shopify-admin themes push --name "Horizon" --input ./themes \
  --site your-store.myshopify.com --access-token shpat_xxxxx
```

## Safety Guidelines

### Theme Push Safety

**Always use `--dry-run` first** when pushing to production themes:
```bash
# ALWAYS preview changes first
shopify-admin themes push --name "Live Theme" --input ./themes --mirror --dry-run

# Only run actual push after reviewing the preview
shopify-admin themes push --name "Live Theme" --input ./themes --mirror
```

**Mirror Mode Warning**
- `--mirror` flag will **DELETE** remote files not present locally
- This is **irreversible** - deleted theme files cannot be recovered
- Use with extreme caution on production themes
- Always backup themes before using mirror mode

**Recommended Workflow**
1. Pull current theme: `shopify-admin themes pull --name "Live Theme" --output ./backup`
2. Make your changes locally
3. Preview with dry-run: `shopify-admin themes push --name "Test Theme" --input ./themes --dry-run`
4. Test on development theme first
5. Use mirror mode only when intentional: `--mirror --dry-run` then `--mirror`

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
