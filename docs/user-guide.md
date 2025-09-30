# Shopify Admin CLI User Guide

## Overview

A command-line tool for Shopify store management designed for GitOps workflows. Supports both interactive use and CI/CD pipelines with stateless authentication.

## Quick Start

### Create Private App

- In your Shopify admin, go to Settings > Apps and sales channels > Develop apps
- Create a new app with required scopes (see below)
- Install the app and copy the access token (starts with `shpat_`)

### Set Credentials

Environment variables (recommended for GitOps):
```bash
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

CLI arguments (overrides environment):
```bash
shopify-admin auth validate --site your-store.myshopify.com --access-token shpat_xxxxx
```

### Install

```bash
git clone https://github.com/vkhazin-befitnow/shopify-admin-cli.git
cd shopify-admin-cli
npm install && npm run build && npm link
```

## Core Concepts

### Dry-Run Mode

Always preview changes before applying them:
```bash
shopify-admin themes push --name "Production" --input ./themes/prod --dry-run
```

Use `--dry-run` to see what would change without making actual changes.

### Mirror Mode

Synchronize exactly with local state - remote items not present locally will be deleted:
```bash
shopify-admin themes push --name "Production" --input ./themes/prod --mirror
```

This is destructive. Always use `--dry-run` first.

### Command Help

For detailed command syntax and options:
```bash
shopify-admin --help
shopify-admin themes --help
shopify-admin themes pull --help
```

## Workflows

### Theme Management Workflow

```bash
# Pull published/main theme (creates backup/themes/[ThemeName]/)
shopify-admin themes pull --published --output ./backup

# Or pull specific theme by name (creates backup/themes/Dawn/)
shopify-admin themes pull --name "Dawn" --output ./backup

# Make changes locally
# ... edit files ...

# Preview changes on test theme
shopify-admin themes push --name "Test Theme" --input ./themes/test --dry-run
shopify-admin themes push --name "Test Theme" --input ./themes/test

# After testing, deploy to production
shopify-admin themes push --name "Live Theme" --input ./themes/prod --mirror --dry-run
shopify-admin themes push --name "Live Theme" --input ./themes/prod --mirror

# Or push directly to published theme (auto-finds in backup/themes/[ThemeName]/)
shopify-admin themes push --published --input ./backup --mirror --dry-run
shopify-admin themes push --published --input ./backup --mirror
```

### Published Theme Shortcut

The `--published` flag streamlines working with the main/published theme:

```bash
# Pull published theme to backup/themes/[ThemeName]/
shopify-admin themes pull --published --output ./backup

# Push to published theme (automatically finds theme in multiple locations)
shopify-admin themes push --published --input ./backup

# Or specify direct path
shopify-admin themes push --published --input ./backup/themes/Dawn
```

Benefits:
- No need to know exact theme name
- Automatically finds the published/main theme  
- Smart path resolution for both pull and push
- Consistent folder structure: output/themes/theme-name

Note: Either `--name` or `--published` must be provided for theme commands.

### Page Management Workflow

```bash
# Pull pages to version control
shopify-admin pages pull --output ./pages

# Edit pages locally
# ... edit HTML files ...

# Preview changes
shopify-admin pages push --input ./pages --dry-run

# Deploy changes
shopify-admin pages push --input ./pages
```

### CI/CD Pipeline Example

```bash
# Authenticate using environment variables
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="${SECRET_TOKEN}"

# Deploy themes to published theme
shopify-admin themes push --published --input ./backup --mirror

# Or deploy to specific theme
shopify-admin themes push --name "Production" --input ./themes --mirror

# Deploy pages
shopify-admin pages push --input ./pages --mirror
```

## Safety Guidelines

### Mirror Mode Warning

- `--mirror` will DELETE remote items not present locally
- This is irreversible
- Always backup first
- Always use `--dry-run` before actual push

### Recommended Practices

- Always run `--dry-run` first
- Test on development theme/store before production
- Keep backups of current state
- Use version control for all files
- Review dry-run output carefully before proceeding

## Page File Format

Pages are stored as HTML files with minimal metadata:

```html
<!-- Page: Contact | Template: contact -->

<h1>Contact Us</h1>
<p>Your page content here...</p>
```

- The template suffix is optional
- No auto-generated metadata (IDs, timestamps) for GitOps compatibility
- Page handle is derived from filename: `contact.html` → handle: `contact`

## Required API Scopes

Configure these scopes in your private app:

### Core Content & Assets

- `read_files`, `write_files`
- `read_content`, `write_content`
- `read_themes`, `write_themes`, `write_theme_code`

### Products & Collections

- `read_products`, `write_products`

### Store Configuration

- `read_online_store_navigation`, `write_online_store_navigation`
- `read_online_store_pages`, `write_online_store_pages`
- `read_script_tags`, `write_script_tags`
- `read_locales`, `write_locales`

### Advanced Features

- `read_legal_policies`, `write_legal_policies`
- `read_metaobject_definitions`, `write_metaobject_definitions`
- `read_metaobjects`, `write_metaobjects`

## Troubleshooting

### Authentication Issues

- Verify access token starts with `shpat_`
- Ensure private app is installed
- Check required scopes are enabled
- Use format: `your-store.myshopify.com`

### Environment Variables

```bash
# Check current values
echo $SHOPIFY_STORE_DOMAIN $SHOPIFY_ACCESS_TOKEN

# Re-export if needed
source ./.env/dev.sh
```

## Command Reference

For detailed command syntax, options, and parameters, use:

```bash
shopify-admin --help
shopify-admin <command> --help
shopify-admin <command> <subcommand> --help
