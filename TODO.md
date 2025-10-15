# TODO: Outstanding Issues

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

### 10. metaobjects.ts Not Using BaseResourceCommand (HIGH PRIORITY)
- Location: `src/commands/metaobjects.ts` (660 lines)
- Issue: Implements own pull/push logic instead of extending BaseResourceCommand
- Impact:
  - ~400 lines of duplicated workflow code
  - Inconsistent with pages.ts, files.ts, products.ts, menus.ts
  - Harder to maintain and test
- Why Not Migrated: Handles nested type directories (e.g., `metaobjects/product_review/`, `metaobjects/blog_post/`)
- Analysis: Similar to themes.ts nested structure BUT metaobjects could potentially use BaseResourceCommand with custom `collectLocalFiles()` override
- Recommendation:
  - Option A: Refactor to use BaseResourceCommand with custom file collection (PREFERRED)
  - Option B: Document why nested structure prevents BaseResourceCommand usage
  - Benefit: Would reduce code by ~400 lines and improve consistency

### 11. Inline GraphQL Query Strings (MEDIUM PRIORITY)
- Locations:
  - `src/commands/menus.ts:56-74` (19 lines)
  - `src/commands/menus.ts:131-141, 157-171, 187-201` (mutation strings)
  - `src/commands/files.ts:135-173` (39 lines)
  - `src/commands/metaobjects.ts:266-294, 308-324, 545-559, 608-618` (multiple large queries)
- Issue: Large GraphQL query strings embedded in methods reduce readability
- Impact: Harder to maintain, test, and reuse queries
- Recommendation: Extract to constants at top of file or separate `queries.ts` file

### 12. Manual GraphQL String Building in menus.ts (MEDIUM PRIORITY)
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

### 13. Inconsistent Error Handling Patterns (MEDIUM PRIORITY)
- metaobjects.ts: Throws errors on upload/delete failures (lines 232, 246)
- Other commands: Logs warnings and continues (via BaseResourceCommand)
- Impact: Inconsistent user experience and error recovery
- Recommendation: Standardize error handling strategy across all commands

### 14. Missing Abstraction for Batch Operations (LOW PRIORITY)
- Location: `src/commands/metaobjects.ts:401-423, 494-516, 583-605`
- Issue: Duplicated batch processing pattern (download/upload/delete loops)
- Note: BaseResourceCommand already provides this abstraction
- Recommendation: Use BaseResourceCommand to eliminate this duplication

### 15. Type Safety Issues in metaobjects.ts (MEDIUM PRIORITY)
- Location: `src/commands/metaobjects.ts:540-543`
```typescript
const fields = Object.entries(content).map(([key, value]) => ({
    key,
    value: String(value)  // Force conversion to string
}));
```
- Issue: Loses type information, potential data corruption for complex types
- Recommendation: Validate field types against definition schema

## Priority Order
1. HIGH: Refactor metaobjects.ts to use BaseResourceCommand (saves ~400 lines)
2. MEDIUM: Replace manual GraphQL string building with variables in menus.ts
3. MEDIUM: Extract large GraphQL queries to constants
4. MEDIUM: Add inline comments to magic numbers in code
5. LOW: Standardize error handling patterns across commands
6. LOW: Add JSDoc documentation to remaining undocumented methods
7. LOW: Consider configuration file support for user preferences

## Summary

Key Outstanding Issues:
- metaobjects.ts (660 lines) not using BaseResourceCommand pattern
- Some GraphQL query handling could be improved
- Inconsistent error handling between metaobjects.ts and other commands

Note: The create-base-resource-class.md task is 80% complete (4 of 5 resources migrated). Completing metaobjects.ts migration would bring consistency and reduce codebase by ~400 lines.
