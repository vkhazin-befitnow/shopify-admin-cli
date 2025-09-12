# Shopify Admin CLI User Guide

## Overview

The Shopify Admin CLI is a comprehensive command-line tool for Shopify store asset management with GitHub integration. It provides access to all store assets that can be downloaded and persisted in a git repository.

This CLI is designed for **Shopify Partners and developers only**.

## Usage

```bash
shopify-admin [command] [options]
```

## Available Commands

### Authentication

#### auth login
Authenticate with Shopify Partners OAuth to access all stores you have permissions for.

```bash
shopify-admin auth login
```
- Authentication opens a browser window for OAuth login.
- Credentials are saved to `~/.shopify-admin-cli/partner-credentials.json`

#### help
Display this user guide.

```bash
shopify-admin help
```

## Permissions and Scopes

The CLI requests comprehensive permissions to access all store assets:

### Core Store Data
- Products and product listings
- Collections and inventory
- Orders and customers

### Theme and Assets
- Themes and theme files
- Content and media files
- Script tags and assets

### Store Configuration
- Shipping and tax settings
- Locales and markets
- Legal policies

### Analytics and Reports
- Store analytics
- Sales reports

### Marketing and Discounts
- Discount codes and price rules
- Marketing events

## Setup

### Environment Variables

Before using the CLI, you need to configure your Shopify Partner app credentials:

#### 1. Create Shopify Partner App

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. Create a partner account if you don't have one
3. In your Partner Dashboard, click **"Apps"** → **"Create app"**
4. Choose **"Create app manually"**
5. Fill in app details:
   - **App name**: Your CLI app name (e.g., "My Store Manager CLI")
   - **App URL**: `http://localhost:9000`
   - **Allowed redirection URL(s)**: `http://localhost:9000/callback`
6. After creating the app, go to **"App setup"** tab
7. Copy your **Client ID** and **Client secret** from the **"App credentials"** section

#### 2. Create .env File

Create a `.env` file in the project root directory with the following format:

```bash
# Shopify Partner App Credentials
SHOPIFY_CLIENT_ID=your_actual_client_id_here
SHOPIFY_CLIENT_SECRET=your_actual_client_secret_here
```

## Getting Started

1. Set up your environment variables (see Setup section above)
2. Run `shopify-admin auth login` to authenticate with your Shopify Partner account
3. Use `shopify-admin help` to see available commands
