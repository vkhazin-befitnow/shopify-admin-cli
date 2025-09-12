# Shopify Authentication Strategy

## OAuth 2.0 Authentication (Recommended)

### Overview

OAuth 2.0 provides the most flexible authentication approach for CLI usage, allowing users to authenticate once and access all stores they have permissions for.

### Why OAuth for CLI

- **Single Authentication**: Login once, access all your stores
- **Dynamic Store Discovery**: Automatically discover accessible stores
- **Real Permissions**: Respects actual user permissions in each store
- **Partner Account Support**: Works with Shopify Partner accounts managing multiple client stores
- **No Manual Setup**: No need to create private apps in each store

### Setup Process

1. **Create Custom App for OAuth**
   - Go to Shopify Partners dashboard
   - Create new app with OAuth capabilities
   - Configure redirect URL for CLI (e.g., `http://localhost:8080/callback`)
   - Note the Client ID and Client Secret

2. **Required Scopes**
   - `read_themes, write_themes` - Theme management
   - `read_products, write_products` - Product data
   - `read_content, write_content` - Pages and blogs
   - `read_files, write_files` - File assets
   - Additional scopes as needed for asset types

### Authentication Flow

1. **Initial Authentication**
   ```bash
   $ shopify-admin auth
   # Opens browser to Shopify OAuth login
   # User authorizes the application
   # CLI receives and stores access token
   ```

2. **Store Discovery**
   ```bash
   $ shopify-admin stores list
   mystore-prod.myshopify.com (Owner)
   mystore-dev.myshopify.com (Owner)
   client-store.myshopify.com (Staff)
   ```

3. **Asset Operations**
   ```bash
   $ shopify-admin pull --store mystore-prod
   $ shopify-admin push --store mystore-dev
   ```

### Configuration Storage

```
~/.shopify-admin-cli/config.json
{
  "auth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": "2024-01-01T00:00:00Z",
    "scopes": ["read_themes", "write_themes", ...]
  },
  "stores": {
    "mystore-prod": {
      "lastSync": "2024-01-01T00:00:00Z"
    },
    "mystore-dev": {
      "lastSync": "2024-01-01T00:00:00Z"
    }
  }
}
```

### Token Management

- **Access Token**: Used for API requests
- **Refresh Token**: Used to obtain new access tokens
- **Automatic Refresh**: CLI handles token refresh transparently
- **Expiration Handling**: Re-authenticate when refresh token expires

### Security Considerations

- Store config file with restricted permissions (600)
- Support environment variables for CI/CD scenarios
- Implement secure token storage and encryption
- Handle token refresh and expiration gracefully
- Validate API access and scopes on startup

### API URL Construction

Base URL: `https://{store-id}.myshopify.com/admin/api/2023-10/`

Authentication Header: `Authorization: Bearer {access_token}`

---

**Note**: This OAuth foundation also supports potential future integration with Shopify App Store marketplace, where the same authentication mechanism could be used for broader distribution to store owners.
