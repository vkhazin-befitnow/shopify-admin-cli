# Shopify Admin CLI User Guide

## Overview

A command-line tool for Shopify store management designed for GitOps workflows. Supports both interactive use and CI/CD pipelines with stateless authentication.

## Quick Start

### Create Private App

- In your Shopify admin, go to Settings > Apps and sales channels > Develop apps > Create an app
- Create a new app with required scopes (see below)
- Install the app and copy the access token (starts with `shpat_`)

## Required API Scopes

Configure these scopes in your private app:

### Core Content & Assets

- `read_files`, `write_files`
- `read_content`, `write_content`
- `read_themes`, `write_themes`, `write_theme_code`

### Products & Collections

- `read_products`, `write_products`

### Content Management

- `read_online_store_blogs`, `write_online_store_blogs`

### Store Configuration

- `read_online_store_navigation`, `write_online_store_navigation`
- `read_online_store_pages`, `write_online_store_pages`
- `read_script_tags`, `write_script_tags`
- `read_locales`, `write_locales`

### URL Management

- `read_redirects`, `write_redirects`

### Advanced Features

- `read_legal_policies`, `write_legal_policies`
- `read_metaobject_definitions`, `write_metaobject_definitions`
- `read_metaobjects`, `write_metaobjects`

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

### Common Command Pattern

All resource commands follow the same pattern:

```bash
# Pull resources from Shopify
shopify-admin <resource> pull --output ./path

# Pull with limit for testing
shopify-admin <resource> pull --output ./path --max-<resource> 10

# Push with dry-run preview
shopify-admin <resource> push --input ./path --dry-run

# Push changes
shopify-admin <resource> push --input ./path

# Mirror mode: sync exactly (deletes remote items not in local)
shopify-admin <resource> push --input ./path --mirror --dry-run
shopify-admin <resource> push --input ./path --mirror
```

Replace `<resource>` with: `pages`, `products`, `collections`, `blogs`, `redirects`, `menus`, `metaobjects`, or `files`

### Resource-Specific Examples

#### Themes (Special Case)

Themes require either `--name` or `--published` flag:

```bash
# Pull published theme
shopify-admin themes pull --published --output ./backup

# Pull specific theme by name
shopify-admin themes pull --name "Dawn" --output ./backup

# Push to published theme (auto-finds theme)
shopify-admin themes push --published --input ./backup --mirror --dry-run
shopify-admin themes push --published --input ./backup --mirror

# Push to specific theme
shopify-admin themes push --name "Production" --input ./themes --mirror
```

#### Pages (HTML Files)

```bash
shopify-admin pages pull --output ./pages
# Edit .html files
shopify-admin pages push --input ./pages --dry-run
shopify-admin pages push --input ./pages
```

#### Products, Collections, Blogs, Redirects, Metaobjects (JSON + Metadata)

```bash
shopify-admin products pull --output ./products --max-products 10
# Edit .json files and .json.meta files
shopify-admin products push --input ./products --dry-run
shopify-admin products push --input ./products --mirror
```

Notes:
- Each resource stored as `.json` with companion `.json.meta` file
- Meta files contain id, handle, and other metadata
- Resources identified by handle

#### Menus (GraphQL-based)

```bash
shopify-admin menus pull --output ./menus
# Edit .json files
shopify-admin menus push --input ./menus --dry-run
shopify-admin menus push --input ./menus
```

#### Files (Media Library)

```bash
shopify-admin files pull --output ./files --max-files 10
# Add/edit media files
shopify-admin files push --input ./files --dry-run
shopify-admin files push --input ./files
```

### Multi-Component Operations

Pull or push multiple components in a single operation:

```bash
# Pull all components (default behavior - no --components needed)
shopify-admin pull --output ./backup

# Or explicitly specify components
shopify-admin pull --components=theme,pages,files,menus,metaobjects,products,collections,blogs,redirects --output ./backup

# Pull specific components
shopify-admin pull --components=pages,menus,products,collections,blogs,redirects --output ./backup

# Push all components (default behavior - no --components needed)
shopify-admin push --input ./backup --mirror --dry-run
shopify-admin push --input ./backup --mirror

# Or explicitly specify components
shopify-admin push --components=theme,pages,files,menus,metaobjects,products,collections,blogs,redirects --input ./backup --mirror

# Push specific components
shopify-admin push --components=pages,files,products,collections,blogs,redirects --input ./backup
```

Features:
- Default components: `theme,files,pages,menus,metaobjects,products,collections,blogs,redirects` (pulls/pushes all when --components not specified)
- Available components: `theme,files,pages,menus,metaobjects,products,collections,blogs,redirects`
- Orchestrates operations across all specified components
- Files stored in `output/files/`, pages in `output/pages/`, menus in `output/menus/`, themes in `output/themes/[ThemeName]/`, metaobjects in `output/metaobjects/`, products in `output/products/`, collections in `output/collections/`, blogs in `output/blogs/`, redirects in `output/redirects/`
- Supports all standard options: `--dry-run`, `--mirror`, credentials
- Processes components sequentially with clear progress output
- Stops on first error for safety

Note: Theme operations always use the published theme when using multi-component commands.

### CI/CD Pipeline Example

```bash
# Set credentials via environment variables
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="${SECRET_TOKEN}"

# Multi-component deployment (recommended)
shopify-admin push --input ./backup --mirror

# Or specific components
shopify-admin push --components=theme,pages,products,collections --input ./backup --mirror
```

## File Formats

### Pages
HTML files with optional metadata comment:
```html
<!-- Page: Contact | Template: contact -->
<h1>Contact Us</h1>
```

### JSON Resources (Products, Collections, Blogs, Redirects, Metaobjects)
Each resource has two files:
- `resource-name.json` - Content data
- `resource-name.json.meta` - ID, handle, and metadata (YAML format)

## Safety Best Practices

1. Always use `--dry-run` first to preview changes
1. `--mirror` mode DELETES remote items not present locally (irreversible)
1. Test on development store/theme before production
1. Keep backups and use version control
1. Review dry-run output carefully before proceeding

## Troubleshooting

### Authentication Issues
- Verify access token starts with `shpat_`
- Ensure private app is installed with required scopes
- Use format: `your-store.myshopify.com`

### Check Environment Variables
```bash
echo $SHOPIFY_STORE_DOMAIN $SHOPIFY_ACCESS_TOKEN
source ./.env/dev.sh  # Re-export if needed
```

## Command Reference

For detailed command syntax, options, and parameters, use:

```bash
shopify-admin --help
shopify-admin <command> --help
shopify-admin <command> <subcommand> --help
