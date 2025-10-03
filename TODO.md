# TODO: Code Quality Issues

## High Priority - Code Duplication & Architecture

### 3. **Weak Type Safety**
- **Location**: `src/commands/pages.ts:377`, `src/commands/pages.ts:411`
- **Issue**: Using `options: any` instead of proper interfaces
- **Impact**: No compile-time safety, runtime errors
- **Solution**: Define proper option interfaces (ThemesPullOptions, PagesPullOptions, etc.)

## Medium Priority - Inconsistent Patterns

### 4. **Inconsistent Error Handling**
- **Location**: Throughout command files
- **Issue**: Mix of console.log, console.warn, console.error without consistent patterns
- **Impact**: Poor debugging experience, inconsistent user feedback
- **Solution**: Create centralized Logger utility with consistent formatting

### 5. **Inconsistent Dry Run Implementation**
- **Location**: All command classes
- **Issue**: Each class implements dry-run differently, some use DryRunManager, others don't
- **Impact**: Inconsistent user experience
- **Solution**: Standardize on DryRunManager usage across all commands

### 6. **Mixed Concerns in Command Classes**
- **Location**: All command classes
- **Issue**: Classes mix HTTP requests, file I/O, and business logic
- **Impact**: Hard to test, violates single responsibility
- **Solution**: Extract HTTP layer, file operations to separate services

## Low Priority - Code Cleanup

### 7. **Magic Numbers and Hardcoded Values**
- **Location**: `src/commands/files.ts:250` (perPage = 250), rate limits scattered
- **Issue**: Magic numbers without explanation
- **Solution**: Move to configuration constants with documentation

### 8. **Inconsistent Method Organization**
- **Location**: All command classes
- **Issue**: Public methods mixed with private, no clear organization
- **Impact**: Hard to understand class interfaces
- **Solution**: Organize methods: public first, then private in logical order

### 9. **Verbose Logging Without Log Levels**
- **Location**: Throughout codebase
- **Issue**: All output goes to console.log, no debug/info/warn/error levels
- **Impact**: Can't control verbosity
- **Solution**: Implement proper logging levels

## Existing Issues

- themes pull should warn in case the path is not empty

## Refactoring Suggestions

### Phase 1: Extract Common Utilities
1. Create `CredentialResolver` utility
2. Create `HttpClient` utility
3. Create `Logger` utility
4. Define proper TypeScript interfaces

### Phase 2: Standardize Patterns
1. Standardize dry-run implementation
2. Consistent error handling
3. Uniform method organization

### Phase 3: Separate Concerns
1. Extract HTTP operations to service layer
2. Extract file operations to service layer
3. Make command classes thin orchestrators
