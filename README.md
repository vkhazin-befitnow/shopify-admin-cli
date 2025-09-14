# Shopify Admin CLI

Comprehensive CLI for Shopify store asset management with GitHub integration.

## Quick Start

```bash
git clone https://github.com/vkhazin-befitnow/shopify-admin-cli.git
cd shopify-admin-cli
npm install
npm run build
npm link
```

## Setup

### Prerequisites

#### 1. Create Shopify Private App

1. Go to your Shopify store admin
1. Navigate to "Settings"
1. Navigate to: "Apps and sales channels"
1. Select "Develop apps"
1. Select "Allow custom app development" follow the prompt to confirm
1. Select "Create an app" -> Name: `Shopify Admin CLI`
1. Select "Configure Admin API scopes" and enable the following scopes:

   - `read_files` - View files
   - `write_files` - Manage files
   - `read_legal_policies` - View shop's legal policies
   - `write_legal_policies` - Manage shop's legal policies
   - `read_metaobject_definitions` - View metaobject definitions
   - `write_metaobject_definitions` - Manage metaobject definitions
   - `read_metaobjects` - View metaobject entries
   - `write_metaobjects` - Manage metaobject entries
   - `read_online_store_navigation` - View menus for display on the storefront
   - `write_online_store_navigation` - Manage storefront navigation
   - `read_online_store_pages` - View Online Store pages
   - `write_online_store_pages` - Manage Online Store pages
   - `read_products` - View products, variants, and collections
   - `write_products` - Manage products, variants, and collections
   - `read_script_tags` - View JavaScript code in storefront or orders status pages
   - `write_script_tags` - Manage JavaScript code in storefront or orders status pages
   - `read_locales` - View available locales for a shop
   - `write_locales` - Manage available locales for a shop
   - `read_content` - View articles, blogs, comments, pages, and redirects
   - `write_content` - Manage articles, blogs, comments, pages, and redirects
   - `read_themes` - View theme templates and assets
   - `write_themes` - Manage theme templates and assets
   - `write_theme_code` - Manage theme code

1. Select "Save"
1. Select "API credentials" tab
1. Select "Install app"
1. Copy the Admin API access token (starts with `shpat_`) - you won't see it again!

### 2. Set Environment Variables

- Create a file ./.env/dev.sh with the env vars
```bash
export SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```
- Source the file: `. ./env/dev.sh`

## Usage

```bash
# Authenticate with environment variables (recommended)
shopify-admin auth login

# Or authenticate interactively
shopify-admin auth login --site store.myshopify.com --access-token shpat_xxxxx

# List authenticated stores
shopify-admin auth list

# Check status
shopify-admin auth status --site ${SHOPIFY_STORE_DOMAIN}
```

## Development

```bash
npm run dev [command]  # Development mode
npm run test          # Run tests
npm run build         # Build project
```

## Multiple Stores

For multiple stores, use environment variables with store prefixes:
```bash
export SHOPIFY_STORE1_DOMAIN="store1.myshopify.com"
export SHOPIFY_STORE1_ACCESS_TOKEN="shpat_xxxxx"
export SHOPIFY_STORE2_DOMAIN="store2.myshopify.com"
export SHOPIFY_STORE2_ACCESS_TOKEN="shpat_yyyyy"
```
