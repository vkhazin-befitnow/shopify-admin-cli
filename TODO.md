# TODO: Outstanding Issues

## GitOps Component Status Summary

### Implemented Components (9 Total)

| Component | API Type | Status | Notes |
|-----------|----------|--------|-------|
| **Themes** | REST | ✅ Complete | Full asset management, nested structure |
| **Files** | GraphQL | ✅ Complete | Media library (images, documents) |
| **Pages** | REST | ✅ Complete | Content pages with CRUD operations |
| **Menus** | GraphQL | ✅ Complete | Navigation menu management |
| **Metaobjects** | GraphQL | ✅ Complete | Two-level hierarchy (definitions + instances) |
| **Products** | REST | ✅ Complete | Full catalog with pagination (349 items) |
| **Collections** | REST | ✅ Complete | Custom and Smart collections (33 items) |
| **Blogs** | REST | ✅ Complete | Two-level hierarchy (blogs + articles) |
| **Redirects** | REST | ✅ Complete | URL redirect management |

### Not Yet Implemented

| Component | API Type | Priority | GitOps Value | Technical Complexity | Notes |
|-----------|----------|----------|--------------|---------------------|-------|
| **Store Settings** | REST | Critical | Store config, policies, SEO | Medium | |
| **Policies** | REST | Critical | Privacy, Refund, ToS, Shipping | Low | |
| **Shipping Zones** | REST | High | Shipping methods, rates config | Medium | |
| **Tax Settings** | REST | High | Tax rules and overrides | Medium | |
| **Webhooks** | REST | High | Event subscription config | Low | |
| **Scripts** | REST | High | Cart/shipping customization | Medium | |
| **Metafields** | REST/GraphQL | High | Custom data on resources | Medium | |
| **Theme Settings** | GraphQL | High | Theme customizer settings | Medium | |
| **DiscountNodes** | GraphQL | High | Modern discount system | High | |
| **Shop Locale** | GraphQL | High | Translation/i18n settings | Medium | |
| **Payment Gateways** | REST | Medium | Payment provider config | Medium | |
| **MarketingActivities** | GraphQL | Medium | Marketing campaign definitions | Medium | |
| **PubSub Webhooks** | GraphQL | Medium | Modern webhook management | Medium | |
| **Carrier Services** | REST | Medium | Custom shipping rate providers | High | |
| **Markets** | GraphQL | Medium | International market config | High | |
| **Price Rules** | REST | Low | Discount structures | Low | Legacy, use DiscountNodes |
| **Smart Collection Rules** | REST | Low | Collection automation | Low | Partial via Collections |
| **Product Variants** | REST | Low | Variant-level settings | Low | Partial via Products |
| **Product Images** | REST | Low | Product media | Low | Partial via Files |
| **Gift Card Templates** | REST | Low | Gift card designs | Low | Not transactions |
| **Locations** | REST | Low | Store location config | Low | Limited GitOps value |
| **Countries/Provinces** | REST | Low | Shipping regions | Low | Rarely changed |
| **Currencies** | REST | Low | Multi-currency settings | Low | Limited GitOps value |

### Intentionally Excluded - Not Suitable for GitOps

| Category | Reason | Examples |
|----------|--------|----------|
| **Customer PII** | Privacy protection | Customer profiles, contact info, addresses |
| **Transaction Data** | Operational data | Orders, payments, refunds, transactions |
| **Inventory Quantities** | Dynamic state | Real-time stock levels, movements |
| **Session Data** | Transient state | Checkouts, carts, abandoned carts |
| **Fulfillment State** | Operational flow | Shipping status, tracking, fulfillments |
| **Analytics Data** | Reporting | Sales reports, traffic stats, conversion data |
| **Draft/Temp Data** | Work-in-progress | Draft orders, unpublished changes |
| **System Logs** | Runtime data | API logs, error logs, audit trails |
| **Usage Data** | Customer-specific | Price rule usage, discount redemptions |
| **Real-time State** | Current state | Online customers, active sessions |

---

## Current Implementation Status (Oct 23, 2025)

### Supported Resources

- Themes: Full theme asset management with nested directory structure
- Files: GraphQL-based file management (images, documents, media)
- Pages: REST API pages with full CRUD operations
- Menus: GraphQL-based navigation menu management
- Metaobjects: Complex two-level hierarchy (definitions + instances)
- Products: Full product catalog with pagination (349 items)
- Collections: Custom and Smart collections (33 items)
- Blogs: Two-level hierarchy for blogs and articles (production-verified)
- Redirects: URL redirect management for SEO

### Architecture Patterns

- BaseResourceCommand: Flat REST resources (pages, products, collections, redirects)
- Standalone Classes: Hierarchical/complex resources (themes, metaobjects, blogs)
- GraphQL Resources: Leveraging GraphQL-only endpoints (files, menus)

## Code Quality Assessment

### Code Quality Issues

- Inline GraphQL Queries: Large query strings embedded in methods reduce maintainability
- Manual String Building: GraphQL mutations use string concatenation instead of variables
- Magic Numbers: Need inline comments and centralized constants
- Method Organization: Public/private methods mixed without clear grouping
- Input Validation: Inconsistent path validation and missing safety checks

### API Implementation Quality

- REST API: Clean implementation using HttpClient with proper error handling
- GraphQL API: Well-structured with automatic pagination and error detection
- Authentication: Robust validation with scope checking and detailed error messages
- Rate Limiting: Consistent 400ms rate limiting across all API operations
- Retry Logic: Sophisticated exponential backoff with jitter and validation error detection

## High Priority - Functionality & Consistency

### Manual GraphQL String Building in menus.ts (SECURITY RISK)

- Location: `src/commands/menus.ts:151-155, 181-185`
- Issue: Manual string concatenation for GraphQL mutations
- Risk: Potential injection vulnerabilities, syntax errors
- Current Code:
```typescript
const itemsInput = items.map(item => `{
    title: ${JSON.stringify(item.title)},
    url: ${JSON.stringify(item.url)},
    type: ${item.type}
}`).join(',');
```
- Solution: Use GraphQL variables instead of string interpolation
- Priority: HIGH (security concern)

### Duplicated Theme Selection Logic

- Location: `src/commands/themes.ts` (lines 75-96 and 155-170)
- Issue: Identical 20+ line theme selection logic duplicated in pull() and push()
- Impact: Code duplication, maintenance burden, inconsistency risk
- Solution: Extract to private method `findTheme(themeName, published, site, accessToken)`

### Missing Error Context in Batch Operations

- Location: All resource commands (themes, blogs, pages, products, collections, files, menus, metaobjects)
- Issue: When batch operations fail, errors are logged but context is limited
- Impact: Hard to debug which specific operation failed in a batch
- Solution: Add structured error logging with operation context, resource identifiers

## Medium Priority - Code Organization & Quality

### Blogs Command Not Using BaseResourceCommand

- Location: `src/commands/blogs.ts` (full file ~450 lines)
- Issue: blogs.ts implements custom logic similar to BaseResourceCommand but standalone
- Analysis: 
  - Two-level hierarchy: blogs → articles
  - Uses custom pagination, file management, mirror mode logic
  - Similar to pages/products but implemented separately
- Impact: Code duplication, maintenance burden
- Solution: Refactor to use BaseResourceCommand pattern with nested resource support
- Note: Current implementation works correctly, but creates technical debt

### Inline GraphQL Query Strings

- Locations:
  - `src/commands/menus.ts:56-74` (19 lines)
  - `src/commands/files.ts` (multiple large queries)
  - `src/commands/metaobjects.ts` (multiple large queries)
- Issue: Large GraphQL query strings embedded in methods reduce readability
- Impact: Harder to maintain, test, and reuse queries
- Solution: Extract to constants at top of file or separate `queries.ts` file
- Benefit: Better code organization, easier query testing, improved maintainability

### Magic Numbers Need Inline Comments

- Status: Magic numbers documented in [`docs/configuration-constants.md`](docs/configuration-constants.md)
- Remaining Actions:
  - Create centralized CONSTANTS object in settings.ts
  - Add inline comments to all magic numbers in code
- Examples: 250 (pagination limit), 400 (rate limit ms), retry counts

### Inconsistent Method Organization

- Location: All standalone command classes (ShopifyThemes, ShopifyBlogs, ShopifyMetaobjects)
- Issue: Public methods (pull/push) mixed with private helpers, no clear grouping
- Impact: Hard to understand class interface, difficult to navigate large files
- Solution: Organize each class:
  - Public API methods (pull, push)
  - Private orchestration methods
  - Private API interaction methods (fetch, upload, delete)
  - Private utility methods (path resolution, file handling)

### Incomplete Input Validation

- Location: All command functions
- Issue: Some paths validated, others not; no checks for path traversal; mirror mode has no confirmation
- Impact: Security risk, poor user experience, potential data loss
- Solution:
  - Validate all file paths for existence and safety
  - Add confirmation prompt for destructive operations (mirror mode)
  - Validate theme names before API calls
  - Check output directory is empty or warn user

### Inconsistent Error Handling Patterns

- Issue: Different commands handle errors inconsistently
- Examples:
  - Some throw errors immediately
  - Some collect errors and return result objects
  - Some log warnings vs errors
- Impact: Inconsistent user experience and error recovery
- Solution: Standardize error handling strategy across all commands

## Low Priority - Code Cleanup & Enhancements

### Missing JSDoc Documentation

- Location: Most public methods in command classes
- Issue: No documentation for parameters, return types, or behavior
- Impact: Poor developer experience, unclear API contracts
- Solution: Add comprehensive JSDoc comments to all public methods
- Benefit: Better IDE support, clearer API contracts

### No Configuration File Support

- Location: Credentials and options only via CLI args or env vars
- Issue: Users must specify site/token repeatedly or set env vars globally
- Impact: Poor developer experience for frequent use
- Solution: Support .shopify-admin.json config file for project-level settings
- Benefit: Improved UX, project-specific configurations

### Type Interfaces Not Shared

- Location: `Page`, `Theme`, `Asset`, `FileNode` interfaces defined per-file
- Issue: Potential for inconsistency, duplication if shared across modules
- Impact: Minor - currently isolated, but limits future refactoring
- Solution: Move shared types to `src/types/` directory if reuse needed
- Benefit: Better type reuse, reduced duplication

## Priority Recommendations

### Immediate Action (Security & Critical Issues)

- HIGH: Fix manual GraphQL string building in menus.ts (security risk)
- HIGH: Add mirror mode confirmation prompts (data loss prevention)

### Short-term Improvements (Code Quality)

- MEDIUM: Refactor blogs.ts to use BaseResourceCommand
- MEDIUM: Extract inline GraphQL queries to constants
- MEDIUM: Add centralized CONSTANTS object for magic numbers
- MEDIUM: Extract duplicated theme selection logic

### Long-term Enhancements (Nice to Have)

- LOW: Standardize error handling patterns
- LOW: Add comprehensive JSDoc documentation
- LOW: Implement configuration file support
- LOW: Organize method grouping in large classes

## Next Component Recommendations

### Critical Store Configuration (Highest Priority)

1. **Store Settings** - Shop configuration, policies, contact info, SEO defaults
2. **Policies** - Privacy, Refund, Terms of Service, Shipping policies
3. **Webhooks** - Event subscription configuration for automation

### Essential Store Operations (High Priority)

4. **Shipping Zones** - Shipping methods and rates configuration
5. **Tax Settings** - Tax rules and overrides
6. **DiscountNodes** - Modern discount system (GraphQL)

### Enhanced Functionality (Medium Priority)

7. **Metafields** - Custom data fields on resources (REST/GraphQL)
8. **Theme Settings** - Theme customizer settings (GraphQL)
9. **Shop Locale** - Translation and internationalization settings (GraphQL)
