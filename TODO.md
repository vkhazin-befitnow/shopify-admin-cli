# TODO: Outstanding Items

## Status Summary

| Status | Count | Components |
|--------|-------|------------|
| **Completed** | 9 | Themes, Files, Pages, Menus, Metaobjects, Products, Collections, Blogs, Redirects |
| **Not Possible** | 3 | Store Settings (read-only), Policies (read-only), Scripts (API not found) |
| **Pending** | 18 | See implementation priorities below |

## Components to Implement

### High Priority

| Component | API Type | Technical Complexity | Notes |
|-----------|----------|---------------------|-------|
| **Webhooks** | REST | Low | Event subscription management |
| **Metafields** | REST/GraphQL | Medium | Custom data on resources |
| **DiscountNodes** | GraphQL | High | Modern discount system |
| **Theme Settings** | GraphQL | Medium | Theme customizer settings |
| **Shop Locale** | GraphQL | Medium | Translation/i18n settings |

### Medium Priority

| Component | API Type | Technical Complexity | Notes |
|-----------|----------|---------------------|-------|
| **Shipping Zones** | GraphQL | Medium | DeliveryProfile supports Create/Read/Update only |
| **Payment Gateways** | REST | Medium | Payment provider config |
| **MarketingActivities** | GraphQL | Medium | Marketing campaign definitions |
| **Carrier Services** | REST | High | Custom shipping rate providers |
| **Markets** | GraphQL | High | International market config |

### Low Priority

| Component | API Type | Technical Complexity | Notes |
|-----------|----------|---------------------|-------|
| **Tax Settings** | REST | Medium | Tax rules and overrides |
| **Price Rules** | REST | Low | Legacy discount system |
| **Smart Collection Rules** | REST | Low | Collection automation |
| **Product Variants** | REST | Low | Variant-level settings |
| **Product Images** | REST | Low | Product media |
| **Gift Card Templates** | REST | Low | Gift card designs |
| **Locations** | REST | Low | Store location config |
| **Countries/Provinces** | REST | Low | Shipping regions |
| **Currencies** | REST | Low | Multi-currency settings |

## Components Not Worth Pursuing

### Read-Only APIs - Cannot Be Implemented

| Component | Reason |
|-----------|---------|
| **Store Settings** | Shop resource is read-only, cannot update via API |
| **Policies** | Policy resource is read-only, cannot update via API |

### APIs Not Found or Deprecated

| Component | Status |
|-----------|---------|
| **Scripts** | ScriptTag API returns 404, likely deprecated |

### Not Suitable for GitOps

| Category | Examples |
|----------|----------|
| **Customer PII** | Customer profiles, contact info, addresses |
| **Transaction Data** | Orders, payments, refunds, transactions |
| **Inventory Quantities** | Real-time stock levels, movements |
| **Session Data** | Checkouts, carts, abandoned carts |
| **Fulfillment State** | Shipping status, tracking, fulfillments |
| **Analytics Data** | Sales reports, traffic stats, conversion data |
| **Draft/Temp Data** | Draft orders, unpublished changes |
| **System Logs** | API logs, error logs, audit trails |
| **Usage Data** | Price rule usage, discount redemptions |
| **Real-time State** | Online customers, active sessions |

## Code Quality Tasks

### High Priority

1. **Extract Duplicated Theme Selection Logic** - `src/commands/themes.ts` lines 75-96 and 155-176
2. **Enhance Mirror Mode Documentation** - CLI help text and user documentation

### Medium Priority

3. **Extract Inline GraphQL Queries** - `src/commands/menus.ts`, `src/commands/files.ts`, `src/commands/metaobjects.ts`
4. **Refactor Manual GraphQL String Building** - `src/commands/menus.ts:151-155, 181-185`

### Low Priority

5. **Add Centralized CONSTANTS Object** - Create in `src/settings.ts`
6. **Add JSDoc Documentation** - Public methods in command classes
7. **Implement Configuration File Support** - `.shopify-admin.json` for project-level settings
8. **Organize Method Grouping** - Standalone command classes
9. **Add Inline Comments for Magic Numbers** - Pagination limits, rate limits, retry counts
