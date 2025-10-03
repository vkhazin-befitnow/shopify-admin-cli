# TODO: Code Quality Issues

## High Priority - Functionality & Consistency

### 11. **Duplicated Theme Selection Logic**
- **Location**: `src/commands/themes.ts` (lines 75-96 and 155-170)
- **Issue**: Identical 20+ line theme selection logic duplicated in pull() and push()
- **Impact**: Code duplication, maintenance burden, inconsistency risk
- **Solution**: Extract to private method `findTheme(themeName, published, site, accessToken)`

## Medium Priority - Code Organization

### 13. **Magic Numbers and Hardcoded Values**
- **Location**: 
  - `src/commands/files.ts:280` (perPage = 250)
  - `src/utils/retry.ts:18-24` (maxAttempts: 5, baseDelayMs: 1000, etc.)
  - `src/settings.ts:24` (maxAttempts: 3, baseDelayMs: 1000)
- **Issue**: Magic numbers without clear explanation or centralization
- **Impact**: Hard to tune performance, inconsistent rate limiting
- **Solution**: 
  - Consolidate pagination limits to SHOPIFY_API.PAGINATION config
  - Document why each value is chosen (API limits, performance tuning)
  - Consider making some values configurable via environment

### 14. **Inconsistent Method Organization**
- **Location**: All command classes (ShopifyPages, ShopifyThemes, ShopifyFiles)
- **Issue**: Public methods (pull/push) mixed with private helpers, no clear grouping
- **Impact**: Hard to understand class interface, difficult to navigate large files
- **Solution**: Organize each class:
  1. Public API methods (pull, push)
  2. Private orchestration methods
  3. Private API interaction methods (fetch, upload, delete)
  4. Private utility methods (path resolution, file handling)

### 15. **Incomplete Input Validation**
- **Location**: All command functions
- **Issue**: Some paths validated, others not; no checks for path traversal; mirror mode has no confirmation
- **Impact**: Security risk, poor user experience, potential data loss
- **Solution**:
  - Validate all file paths for existence and safety
  - Add confirmation prompt for destructive operations (mirror mode)
  - Validate theme names before API calls
  - Check output directory is empty or warn user

### 16. **HTTP Response Handling Duplication**
- **Location**: 
  - `src/commands/themes.ts` (lines 234-244, 282-292, 349-363, 470-485)
  - `src/commands/pages.ts` (lines 170-180)
  - `src/commands/files.ts` (lines 319-329)
- **Issue**: Identical 401/403/error handling repeated in multiple places
- **Impact**: Maintenance burden, inconsistent error messages
- **Note**: Partially addressed by HttpClient but still duplicated in fetch methods

## Low Priority - Code Cleanup

### 17. **Missing JSDoc Documentation**
- **Location**: Most public methods in command classes
- **Issue**: No documentation for parameters, return types, or behavior
- **Impact**: Poor developer experience, unclear API contracts
- **Solution**: Add comprehensive JSDoc comments to all public methods

### 18. **Verbose GraphQL Query Strings**
- **Location**: `src/commands/files.ts` (lines 235-275, 555-603, 680-735)
- **Issue**: Large inline GraphQL query strings make code hard to read
- **Impact**: Reduced readability, harder to maintain queries
- **Solution**: Extract queries to separate constants or files

### 19. **No Configuration File Support**
- **Location**: Credentials and options only via CLI args or env vars
- **Issue**: Users must specify site/token repeatedly or set env vars globally
- **Impact**: Poor developer experience for frequent use
- **Solution**: Support .shopify-admin.json config file for project-level settings

### 20. **Type Interfaces Not Shared**
- **Location**: `Page`, `Theme`, `Asset`, `FileNode` interfaces defined per-file
- **Issue**: Potential for inconsistency, duplication if shared across modules
- **Impact**: Minor - currently isolated, but limits future refactoring
- **Solution**: Move shared types to `src/types/` directory if reuse needed

## Completed

### 1. **Credential Duplication** ✅
- **Status**: COMPLETED - Created CredentialResolver utility
- **Results**: 130+ lines eliminated across 4 command files

### 2. **HTTP Client Duplication** ✅
- **Status**: COMPLETED - Created HttpClient utility
- **Results**: 50+ lines eliminated from pages.ts and themes.ts

### 3. **Weak Type Safety** ✅
- **Status**: COMPLETED - Added proper TypeScript interfaces
- **Results**: All "options: any" replaced with typed interfaces

### 4. **Inconsistent Error Handling** ✅
- **Status**: COMPLETED - Created Logger utility
- **Results**: 
  - Standardized all logging across 6 files
  - Support for log levels (ERROR, WARN, INFO, DEBUG)
  - 50+ console calls replaced with Logger methods

### 5. **Inconsistent Dry Run Implementation** ✅
- **Status**: COMPLETED - Enhanced DryRunManager
- **Results**: 60+ lines of manual dry-run checks eliminated

### 10. **CLI Entry Point Not Using Logger** ✅
- **Status**: COMPLETED - Replaced all console calls with Logger
- **Results**:
  - Added Logger import to src/index.ts
  - Replaced 20+ console.log calls with Logger.info()
  - Replaced 10+ console.error calls with Logger.error()
  - Used Logger.success() for completion messages
  - Now consistent with Logger usage across all 6 other files (62+ Logger calls)
  - Benefits: Uniform logging pattern, can control verbosity, consistent output formatting

## Refactoring Progress

### Phase 1: Extract Common Utilities ✅
1. ✅ Create `CredentialResolver` utility
2. ✅ Create `HttpClient` utility
3. ✅ Create `Logger` utility
4. ✅ Define proper TypeScript interfaces
5. ✅ Create `DryRunManager` utility
6. ✅ Create `IOUtility` utility

### Phase 2: Standardize Patterns (Partial)
1. ✅ Standardize dry-run implementation
2. ✅ Consistent error handling (Logger)
3. ⚠️  Uniform method organization (still needed)

### Phase 3: Future Considerations
1. Extract HTTP operations to service layer (consider if needed)
2. Extract file operations to service layer (consider if needed)
3. Configuration file support
4. Enhanced input validation
