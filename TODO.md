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

## Code Quality Assessment (Oct 30, 2025)

### Code Quality Issues

- Inline GraphQL Queries: Large query strings embedded in methods reduce maintainability
- Manual String Building: GraphQL mutations use string concatenation instead of variables (maintainability, not security)
- Magic Numbers: Need inline comments and centralized constants
- Method Organization: Public/private methods mixed without clear grouping
- Input Validation: Inconsistent path validation and missing safety checks

### API Implementation Quality

- REST API: Clean implementation using HttpClient with proper error handling
- GraphQL API: Well-structured with automatic pagination and error detection
- Authentication: Robust validation with scope checking and detailed error messages
- Rate Limiting: Consistent 400ms rate limiting across all API operations
- Retry Logic: Sophisticated exponential backoff with jitter and validation error detection

### Recent Improvements (Oct 2025)

- ✅ Per-resource error handling: Batch operations now continue on individual failures
- ✅ Published theme canonical folder: `themes/published/` for cross-environment promotions
- ✅ Files resource hardening: Safe handling of missing API fields
- ✅ CLI help documentation: Clear user guidance for published folder behavior
- ✅ All tests passing: 13 test suites, 120+ tests validated

## High Priority - Functionality & User Experience

### Missing Confirmation for Mirror Mode Deletions

- Location: All commands with `--mirror` flag
- Issue: `--mirror` flag is destructive but has no confirmation prompt
- Risk: Accidental data loss from unintended destructive operations
- Impact: User could accidentally delete local or remote resources
- Solution: Add interactive confirmation prompt or require `--force` flag for non-interactive use
- Priority: HIGH (data loss prevention)

### Duplicated Theme Selection Logic

- Location: `src/commands/themes.ts` (lines 75-96 and 155-176)
- Issue: Identical 20+ line theme selection logic duplicated in pull() and push()
- Impact: Code duplication, maintenance burden, inconsistency risk
- Solution: Extract to private method `findTheme(themeName, published, site, accessToken)`
- Priority: MEDIUM (code quality, ~10 minutes to fix)

### Batch Operation Error Context

- Location: All resource commands - now partially addressed with per-resource try/catch
- Status: ✅ IMPROVED - Errors now collected and reported with resource handles
- Remaining: Could add structured error logging with more context
- Priority: LOW (current implementation is functional)

## Medium Priority - Code Organization & Quality

### Manual GraphQL String Building in menus.ts

- Location: `src/commands/menus.ts:151-155, 181-185`
- Issue: Manual string concatenation for GraphQL mutations
- Analysis: Uses `JSON.stringify()` for strings, enum validation for types
- Security Impact: **NONE** - Locally executed CLI with trusted user input
- Real Impact: Maintainability and potential for syntax errors
- Current Code:
```typescript
const itemsInput = items.map(item => `{
    title: ${JSON.stringify(item.title)},
    url: ${JSON.stringify(item.url)},
    type: ${item.type}
}`).join(',');
```
- Solution: Use GraphQL variables for cleaner code
- Priority: MEDIUM (code quality, nice-to-have)
- Note: Safe to use as-is; not a security vulnerability in local CLI context

### Blogs and Themes Commands Architecture

- Location: `src/commands/blogs.ts` (~450 lines), `src/commands/themes.ts` (~460 lines)
- Issue: Custom implementations don't use BaseResourceCommand pattern
- Analysis:
  - Blogs: Two-level hierarchy (blogs → articles) with complex pagination
  - Themes: Nested directory structure with specialized asset handling
  - Both have unique output structures that don't fit flat resource model
- Constraint: **BaseResourceCommand designed for flat REST resources**
  - Assumes single-level file structure: `output/[resource]/[handle][ext]`
  - Blogs need: `output/blogs/[blog-handle]/[article-handle].html`
  - Themes need: `output/themes/[theme-name]/[subfolder]/[asset]`
- Impact: Code duplication exists but is justified by structural differences
- Solution: Current standalone implementations are appropriate
- Priority: LOW (architectural constraint, not a defect)
- Note: Refactoring would require major BaseResourceCommand redesign to support nested hierarchies

### Inline GraphQL Query Strings

- Locations:
  - `src/commands/menus.ts:56-74` (19 lines)
  - `src/commands/files.ts` (multiple large queries)
  - `src/commands/metaobjects.ts` (multiple large queries)
- Issue: Large GraphQL query strings embedded in methods reduce readability
- Impact: Harder to maintain, test, and reuse queries
- Solution: Extract to constants at top of file or separate `queries.ts` file
- Benefit: Better code organization, easier query testing, improved maintainability
- Priority: LOW (nice-to-have, ~30 minutes total)

### Magic Numbers Need Inline Comments

- Status: Magic numbers documented in [`docs/configuration-constants.md`](docs/configuration-constants.md)
- Remaining Actions:
  - Create centralized CONSTANTS object in settings.ts
  - Add inline comments to all magic numbers in code
- Examples: 250 (pagination limit), 400 (rate limit ms), retry counts
- Priority: LOW (documentation exists, inline comments are nice-to-have)

### Inconsistent Method Organization

- Location: All standalone command classes (ShopifyThemes, ShopifyBlogs, ShopifyMetaobjects)
- Issue: Public methods (pull/push) mixed with private helpers, no clear grouping
- Impact: Hard to understand class interface, difficult to navigate large files
- Solution: Organize each class:
  - Public API methods (pull, push)
  - Private orchestration methods
  - Private API interaction methods (fetch, upload, delete)
  - Private utility methods (path resolution, file handling)
- Priority: LOW (cosmetic, ~20 minutes per file)

### Input Validation Improvements

- Location: All command functions
- Current State: Basic validation exists, paths are validated in IOUtility
- Improvements Needed:
  - ✅ Path existence checking (already implemented in IOUtility)
  - ❌ Mirror mode confirmation prompt (HIGH priority - see above)
  - ✅ Theme name validation (happens via API call with clear error)
  - ✅ Output directory creation (automatic via IOUtility.ensureDirectoryExists)
- Priority: HIGH for mirror confirmation, LOW for other improvements

### Error Handling Patterns - Mostly Resolved

- Status: ✅ IMPROVED with Oct 2025 per-resource error handling updates
- Current State: Commands now use consistent BatchResult pattern
- Remaining Inconsistencies:
  - BaseResourceCommand: Collects errors, continues processing
  - Themes/Blogs: Individual try/catch per operation
  - Both patterns are appropriate for their use cases
- Impact: Minimal - user experience is consistent
- Priority: LOW (current implementation is functional and appropriate)

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

## Priority Recommendations (Updated Oct 30, 2025)

### Critical Priority - Data Safety

1. **Add Mirror Mode Confirmation Prompts**
   - Impact: Prevents accidental data loss
   - Effort: ~15 minutes
   - Status: Not implemented
   - Why Critical: Destructive operations should require explicit confirmation

### High Priority - User Experience & Stability

2. **Extract Duplicated Theme Selection Logic**
   - Impact: Reduces maintenance burden, improves consistency
   - Effort: ~10 minutes
   - Status: Not implemented
   - Why High: Code duplication in critical path

3. **Update User Documentation**
   - Impact: Users understand published folder behavior
   - Effort: ~15 minutes
   - Status: Partially complete (CLI help done, docs pending)
   - Why High: Recent feature requires documentation

### Medium Priority - Code Quality

4. **Extract Inline GraphQL Queries**
   - Impact: Improves maintainability and readability
   - Effort: ~30 minutes
   - Status: Not implemented
   - Why Medium: Nice-to-have, not blocking functionality

5. **Refactor Manual GraphQL String Building**
   - Impact: Cleaner code, easier to maintain
   - Effort: ~20 minutes
   - Status: Not implemented
   - Why Medium: Code quality issue, not a security risk in local CLI context
   - Note: Current implementation is safe and functional

### Low Priority - Nice to Have

6. **Add Centralized CONSTANTS Object**
   - Impact: Better code organization
   - Effort: ~20 minutes
   - Status: Magic numbers are documented but not centralized
   - Why Low: Documentation exists, inline comments sufficient

7. **Add Comprehensive JSDoc Documentation**
   - Impact: Better developer experience
   - Effort: ~2 hours
   - Status: Minimal documentation exists
   - Why Low: Code is relatively self-documenting

8. **Implement Configuration File Support**
   - Impact: Better UX for frequent users
   - Effort: ~1 hour
   - Status: Not implemented
   - Why Low: Environment variables and CLI args work well

9. **Organize Method Grouping in Large Classes**
   - Impact: Easier navigation
   - Effort: ~20 minutes per file
   - Status: Not implemented
   - Why Low: Cosmetic improvement

### Not Recommended - Architectural Constraints

- ❌ **Refactor Blogs to use BaseResourceCommand**: BaseResourceCommand designed for flat structure, blogs require nested hierarchy (blogs → articles)
- ❌ **Refactor Themes to use BaseResourceCommand**: Themes require nested directory structure incompatible with flat resource model
- Note: Current standalone implementations are appropriate given structural requirements

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
