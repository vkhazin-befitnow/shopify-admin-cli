# TODO: Outstanding Issues

## Recent Updates

### Collections Implementation (Oct 17, 2025)

**Completed**: Full collections support added to CLI

**Implementation Details**:
- Extends `BaseResourceCommand` for consistent architecture
- Supports both Custom Collections and Smart Collections
- Uses REST API with pagination (fetches all collections)
- Stores collection type in metadata for proper push routing
- Smart collections preserve rules and disjunctive logic

**Files Changed**:
- `src/commands/collections.ts`: New collections command
- `src/index.ts`: Added collections to pull/push commands
- `tests/collections.test.ts`: Comprehensive test suite

**Current Coverage**: 33 collections pulled successfully (custom + smart)

### Pagination Implementation (Oct 16, 2025)

**Issue Resolved**: REST API endpoints were only returning first 50 items (default Shopify limit)

**Solution**: Implemented centralized pagination in `BaseResourceCommand`
- Added `fetchResourcesWithPagination` helper method supporting REST API Link header pagination
- Products command now fetches all 349 products (was 50)
- Pages command updated to use centralized pagination
- Menus command updated with GraphQL cursor-based pagination
- Files command already had GraphQL pagination implemented

**Files Changed**:
- `src/commands/base/BaseResourceCommand.ts`: Added pagination helper method
- `src/commands/products.ts`: Simplified to use base class pagination
- `src/commands/pages.ts`: Simplified to use base class pagination
- `src/commands/menus.ts`: Added GraphQL cursor-based pagination

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

## Current Implementation Coverage

### Supported Resources (Oct 2025)

- **Themes**: Full theme asset management with nested directory structure
- **Files**: GraphQL-based file management (images, documents, media)
- **Pages**: REST API pages with full CRUD operations
- **Menus**: GraphQL-based navigation menu management
- **Metaobjects**: Complex two-level hierarchy (definitions + instances)
- **Products**: Full product catalog with pagination (349 items)
- **Collections**: Custom and Smart collections (33 items)

### Architecture Patterns

1. **BaseResourceCommand**: Flat REST resources (pages, products, collections)
2. **Standalone Classes**: Hierarchical/complex resources (themes, metaobjects, blogs)
3. **GraphQL Resources**: Leveraging GraphQL-only endpoints (files, menus)

### Next Implementation Priority

**Blog Articles** - Complete content management capability alongside pages
- Two-level hierarchy: blogs → articles
- REST API endpoints available
- Follows metaobjects pattern (standalone class)
- High business value for content marketing

## High Priority - Functionality & Consistency

### 1. HTTP Error Handling Duplication in themes.ts

- Location: `src/commands/themes.ts` (lines 234-244, 264-274, 329-343, 446-461)
- Issue: Duplicated HTTP error handling code (401/403/404 checks) in fetch methods
- Analysis: themes.ts correctly does NOT use BaseResourceCommand due to nested directory structure requirements
- Impact: ~100 lines of duplicated error handling, but architectural separation is justified
- Solution:
  1. Extract common error handling to a shared utility method within themes.ts
  2. Consider creating a `ThemeHttpClient` wrapper that extends HttpClient with theme-specific error context
  3. Keep themes.ts separate from BaseResourceCommand (nested vs flat structure)
- Benefits: Reduced duplication while maintaining appropriate architectural boundaries

### 2. Duplicated Theme Selection Logic

- Location: `src/commands/themes.ts` (lines 75-96 and 155-170)
- Issue: Identical 20+ line theme selection logic duplicated in pull() and push()
- Impact: Code duplication, maintenance burden, inconsistency risk
- Solution: Extract to private method `findTheme(themeName, published, site, accessToken)`

## Medium Priority - Code Organization

### 3. Magic Numbers Need Inline Comments

- Status: Magic numbers are documented in [`docs/configuration-constants.md`](docs/configuration-constants.md)
- Remaining Actions:
  - Create centralized CONSTANTS object in settings.ts
  - Add inline comments to all magic numbers in code

### 4. Inconsistent Method Organization

- Location: All command classes (ShopifyPages, ShopifyThemes, ShopifyFiles)
- Issue: Public methods (pull/push) mixed with private helpers, no clear grouping
- Impact: Hard to understand class interface, difficult to navigate large files
- Solution: Organize each class:
  1. Public API methods (pull, push)
  2. Private orchestration methods
  3. Private API interaction methods (fetch, upload, delete)
  4. Private utility methods (path resolution, file handling)

### 5. Incomplete Input Validation

- Location: All command functions
- Issue: Some paths validated, others not; no checks for path traversal; mirror mode has no confirmation
- Impact: Security risk, poor user experience, potential data loss
- Solution:
  - Validate all file paths for existence and safety
  - Add confirmation prompt for destructive operations (mirror mode)
  - Validate theme names before API calls
  - Check output directory is empty or warn user

## Low Priority - Code Cleanup

### 6. Missing JSDoc Documentation
- Location: Most public methods in command classes
- Issue: No documentation for parameters, return types, or behavior
- Impact: Poor developer experience, unclear API contracts
- Solution: Add comprehensive JSDoc comments to all public methods

### 7. Verbose GraphQL Query Strings

- Location: `src/commands/files.ts` (lines 235-275, 555-603, 680-735)
- Issue: Large inline GraphQL query strings make code hard to read
- Impact: Reduced readability, harder to maintain queries
- Solution: Extract queries to separate constants or files

### 8. No Configuration File Support

- Location: Credentials and options only via CLI args or env vars
- Issue: Users must specify site/token repeatedly or set env vars globally
- Impact: Poor developer experience for frequent use
- Solution: Support .shopify-admin.json config file for project-level settings

### 9. Type Interfaces Not Shared

- Location: `Page`, `Theme`, `Asset`, `FileNode` interfaces defined per-file
- Issue: Potential for inconsistency, duplication if shared across modules
- Impact: Minor - currently isolated, but limits future refactoring
- Solution: Move shared types to `src/types/` directory if reuse needed

## Key Code Issues Identified

### 10. Inline GraphQL Query Strings (MEDIUM PRIORITY)
- Locations:
  - `src/commands/menus.ts:56-74` (19 lines)
  - `src/commands/menus.ts:131-141, 157-171, 187-201` (mutation strings)
  - `src/commands/files.ts:135-173` (39 lines)
  - `src/commands/metaobjects.ts:266-294, 308-324, 545-559, 608-618` (multiple large queries)
- Issue: Large GraphQL query strings embedded in methods reduce readability
- Impact: Harder to maintain, test, and reuse queries
- Recommendation: Extract to constants at top of file or separate `queries.ts` file

### 11. Manual GraphQL String Building in menus.ts (MEDIUM PRIORITY)
- Location: `src/commands/menus.ts:151-155, 181-185`
```typescript
const itemsInput = items.map(item => `{
    title: ${JSON.stringify(item.title)},
    url: ${JSON.stringify(item.url)},
    type: ${item.type}
}`).join(',');
```
- Issue: Manual string concatenation for GraphQL mutations is error-prone
- Risk: Potential injection vulnerabilities, syntax errors
- Recommendation: Use GraphQL variables instead of string interpolation

### 12. Inconsistent Error Handling Patterns (MEDIUM PRIORITY)

- Issue: Different commands handle errors inconsistently
- Impact: Inconsistent user experience and error recovery
- Recommendation: Standardize error handling strategy across all commands

## Priority Order

1. MEDIUM: Replace manual GraphQL string building with variables in menus.ts
2. MEDIUM: Extract large GraphQL queries to constants
3. MEDIUM: Add inline comments to magic numbers in code
4. LOW: Standardize error handling patterns across commands
5. LOW: Add JSDoc documentation to remaining undocumented methods
6. LOW: Consider configuration file support for user preferences

## Summary

Key Outstanding Issues:
- GraphQL query handling could be improved
- Some inconsistent patterns across commands
- Minor code organization and documentation improvements needed

Note: The BaseResourceCommand pattern is successfully implemented in 4/5 resource commands (pages, files, products, menus). The metaobjects.ts maintains a separate architecture due to its complex nested directory structure and multi-resource type operations.
