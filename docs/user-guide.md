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
Authenticate with Shopify Partners OAuth to access all stores you have permissions for.

```bash
shopify-admin auth login
```
- Authentication opens a browser window for OAuth login.
- Credentials are saved to `~/.shopify-admin-cli/partner-credentials.json`

## Setup

For setup instructions including Shopify Partner app creation and environment variable configuration, see the [README.md](../README.md) in the project root.

## Getting Started

1. Set up your environment variables (see [README.md](../README.md) for setup instructions)
2. Run `shopify-admin auth login` to authenticate with your Shopify Partner account
3. Use `shopify-admin help` to see available commands
