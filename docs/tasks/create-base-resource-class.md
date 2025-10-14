# Task: Create Base Resource Abstract Class

## Overview
Create an abstract base class to eliminate code duplication across resource command files (themes, files, menus, metaobjects, products). This will reduce approximately 1,200 lines of duplicated code and improve maintainability.

## The basic implementation principle:

- smaller units of work
- run tests using the specific file first: . ./.env/dev.sh && npm build && npx ts-node ./tests/filename
- run all tests before moving to the next tasks: . ./.env/dev.sh && npm test
- resolve issues found and test again
- quit and ask human for assistance should the 3 attempts to code -> test -> fix are exceeded

## Problem Statement

Currently, all resource command files share nearly identical patterns:
- **Pull workflow**: Fetch → Mirror check → Dry run → Download → Delete → Summary
- **Push workflow**: Collect local → Fetch remote → Mirror check → Dry run → Upload → Delete → Summary
- **Batch processing**: Progress tracking, error handling, retry logic
- **File operations**: Collection, metadata handling, path resolution
- **Logging patterns**: Consistent progress and error reporting

### Affected Files
1. `src/commands/themes.ts`
2. `src/commands/files.ts`
3. `src/commands/menus.ts`
4. `src/commands/metaobjects.ts`
5. `src/commands/products.ts`

### Duplication Statistics
| Pattern | Lines per File | Total Duplication |
|---------|---------------|-------------------|
| Pull workflow | ~150 | ~750 lines |
| Push workflow | ~150 | ~750 lines |
| Batch processing | ~20 × 3 | ~300 lines |
| File collection | ~30 | ~150 lines |
| **Total** | | **~1,950 lines** |

---

## Solution Design

### 1. Create Abstract Base Class

**File**: `src/commands/base/BaseResourceCommand.ts`

```typescript
export abstract class BaseResourceCommand<TResource, TMetadata> {
    protected httpClient = new HttpClient();
    protected static readonly META_EXTENSION = '.meta';
    
    // Abstract methods - must be implemented by subclasses
    abstract getResourceName(): string;
    abstract getFileExtension(): string;
    abstract fetchResources(site: string, accessToken: string): Promise<TResource[]>;
    abstract getResourceHandle(resource: TResource): string;
    abstract extractMetadata(resource: TResource): TMetadata;
    abstract downloadSingleResource(resource: TResource, outputPath: string): Promise<void>;
    abstract uploadSingleResource(site: string, accessToken: string, file: LocalFile<TMetadata>): Promise<void>;
    abstract deleteSingleResource(site: string, accessToken: string, resource: TResource): Promise<void>;
    
    // Concrete methods - shared implementation
    async pull(options: PullOptions): Promise<void>;
    async push(options: PushOptions): Promise<void>;
    protected async batchProcess<T>(items: T[], operation: BatchOperation<T>): Promise<BatchResult>;
    protected collectLocalFiles(inputPath: string): LocalFile<TMetadata>[];
    protected findLocalFilesToDelete(outputPath: string, remoteHandles: Set<string>): string[];
    protected deleteLocalFiles(outputPath: string, filesToDelete: string[]): number;
    
    // Metadata handling - shared implementation
    protected writeMetadata(filePath: string, metadata: TMetadata): void;
    protected readMetadata(filePath: string): TMetadata | undefined;
    protected getMetadataPath(filePath: string): string;
}
```

### 2. Resource-Specific Implementations

Each resource command will extend the base class and implement only the unique logic:

```typescript
// Example: src/commands/products.ts
export class ShopifyProducts extends BaseResourceCommand<Product, ProductMetadata> {
    getResourceName() { return 'products'; }
    getFileExtension() { return '.json'; }
    
    async fetchResources(site: string, accessToken: string): Promise<Product[]> {
        // Product-specific fetch logic
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/products.json`;
        const response = await this.httpClient.request(url, 'GET', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'products',
            operationContext: 'fetch products list'
        });
        const result: ProductListResult = await response.json();
        return result.products;
    }
    
    getResourceHandle(product: Product): string {
        return product.handle;
    }
    
    extractMetadata(product: Product): ProductMetadata {
        // Extract metadata that should be persisted in .meta file
        return {
            id: product.id,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor,
            product_type: product.product_type,
            created_at: product.created_at,
            updated_at: product.updated_at,
            published_at: product.published_at,
            template_suffix: product.template_suffix,
            status: product.status,
            published_scope: product.published_scope,
            tags: product.tags
        };
    }
    
    async downloadSingleResource(product: Product, outputPath: string): Promise<void> {
        // Write main product data (without metadata fields)
        const filePath = this.getResourceFilePath(outputPath, product);
        const productData = {
            title: product.title,
            body_html: product.body_html || '',
            vendor: product.vendor,
            product_type: product.product_type,
            tags: product.tags,
            variants: product.variants,
            options: product.options,
            images: product.images
        };
        fs.writeFileSync(filePath, JSON.stringify(productData, null, 2), 'utf8');
        // Note: Metadata is written automatically by base class
    }
    
    // ... implement upload and delete methods
}
```

**Key Points:**
- Main resource data goes in the primary file (e.g., `product.json`)
- Metadata (IDs, timestamps, handles) goes in `.meta` file (e.g., `product.json.meta`)
- Base class handles all `.meta` file operations automatically
- Subclasses only need to implement `extractMetadata()` method

---

## Implementation Plan

### Phase 1: Create Base Infrastructure (Day 1)

#### Step 1.1: Create Base Class Structure
**File**: `src/commands/base/BaseResourceCommand.ts`

**Tasks**:
1. Define generic types for TResource and TMetadata
2. Create abstract method signatures
3. Implement shared pull() workflow
4. Implement shared push() workflow
5. Add batch processing utility
6. Add file collection utilities

**Test Command to use exactly as is**:
```bash
. ./.env/dev.sh && npm test
```

**Acceptance Criteria**:

- TypeScript compiles without errors
- All abstract methods properly defined
- Generic types work correctly
- Tests ran without errors

---

#### Step 1.2: Create Supporting Types
**File**: `src/commands/base/types.ts`

```typescript
export interface PullOptions {
    output: string;
    site: string;
    accessToken: string;
    maxItems?: number;
    dryRun?: boolean;
    mirror?: boolean;
}

export interface PushOptions {
    input: string;
    site: string;
    accessToken: string;
    dryRun?: boolean;
    mirror?: boolean;
}

export interface LocalFile<TMetadata> {
    handle: string;
    filePath: string;
    metadata?: TMetadata;
}

export interface BatchResult {
    processed: number;
    failed: number;
    errors: string[];
}

export interface BatchOperation<T> {
    execute: (item: T) => Promise<void>;
    getItemName: (item: T) => string;
    operationName: string;
}
```

---

#### Step 1.3: Implement Metadata Utilities
**File**: `src/commands/base/BaseResourceCommand.ts`

**Shared Metadata Methods**:
```typescript
/**
 * Write metadata to .meta file using YAML format
 * This is called automatically after downloading each resource
 */
protected writeMetadata(filePath: string, metadata: TMetadata): void {
    const metaPath = this.getMetadataPath(filePath);
    fs.writeFileSync(metaPath, yaml.dump(metadata), 'utf8');
}

/**
 * Read metadata from .meta file
 * Returns undefined if file doesn't exist or can't be parsed
 */
protected readMetadata(filePath: string): TMetadata | undefined {
    const metaPath = this.getMetadataPath(filePath);
    
    if (!fs.existsSync(metaPath)) {
        return undefined;
    }
    
    try {
        const metaContent = fs.readFileSync(metaPath, 'utf8');
        return yaml.load(metaContent) as TMetadata;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.warn(`Failed to read metadata from ${metaPath}: ${message}`);
        return undefined;
    }
}

/**
 * Get the path to the .meta file for a given resource file
 */
protected getMetadataPath(filePath: string): string {
    return `${filePath}${BaseResourceCommand.META_EXTENSION}`;
}
```

**Usage in Download Flow**:
```typescript
protected async downloadSingleResourceWithMetadata(
    resource: TResource,
    outputPath: string
): Promise<void> {
    // 1. Download the resource file (implemented by subclass)
    await this.downloadSingleResource(resource, outputPath);
    
    // 2. Extract and write metadata (handled by base class)
    const metadata = this.extractMetadata(resource);
    const filePath = this.getResourceFilePath(outputPath, resource);
    this.writeMetadata(filePath, metadata);
}
```

**Usage in Upload Flow**:
```typescript
protected collectLocalFiles(inputPath: string): LocalFile<TMetadata>[] {
    const files: LocalFile<TMetadata>[] = [];
    
    if (!fs.existsSync(inputPath)) {
        return files;
    }
    
    const entries = fs.readdirSync(inputPath, { withFileTypes: true });
    
    entries.forEach(entry => {
        if (entry.isFile() && entry.name.endsWith(this.getFileExtension())) {
            const filePath = path.join(inputPath, entry.name);
            const handle = entry.name.replace(this.getFileExtension(), '');
            
            // Read metadata if it exists
            const metadata = this.readMetadata(filePath);
            
            files.push({ handle, filePath, metadata });
        }
    });
    
    return files;
}
```

**Metadata Deletion**:
```typescript
protected deleteLocalFiles(outputPath: string, filesToDelete: string[]): number {
    let deletedCount = 0;
    
    filesToDelete.forEach(file => {
        const filePath = path.join(outputPath, file);
        
        try {
            // Delete main file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
            
            // Delete .meta file if it exists
            if (!file.endsWith(BaseResourceCommand.META_EXTENSION)) {
                const metaPath = this.getMetadataPath(filePath);
                if (fs.existsSync(metaPath)) {
                    fs.unlinkSync(metaPath);
                    deletedCount++;
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            Logger.error(`Failed to delete ${file}: ${message}`);
        }
    });
    
    return deletedCount;
}
```

**Test Command**:
```bash
npx tsc --noEmit
```

**Acceptance Criteria**:
- Metadata is written as YAML to `.meta` files
- Metadata is read correctly during file collection
- Both main file and `.meta` file are deleted together
- Error handling for missing or corrupt metadata files

---

### Phase 2: Migrate Products Command (Day 2)

#### Step 2.1: Refactor ShopifyProducts Class
**File**: `src/commands/products.ts`

**Tasks**:
1. Make ShopifyProducts extend BaseResourceCommand
2. Remove duplicated pull/push logic
3. Implement abstract methods
4. Keep product-specific logic (variants, options, images)

**Test Command**:
```bash
. ./.env/dev.sh && npx ts-node ./tests/products.test.ts
```

**Acceptance Criteria**:
- All 8 product tests pass
- No functionality changes
- Code reduced by ~150 lines

---

#### Step 2.2: Verify CLI Integration
**Test Command**:
```bash
npx shopify-admin pull --output=./tests/test-run/base-test --components=products
```

**Acceptance Criteria**:
- Products pull successfully
- All logging works correctly
- Mirror mode functions properly
- Dry run mode works

---

### Phase 3: Migrate Remaining Commands (Day 3)

#### Step 3.1: Migrate Pages Command
**File**: `src/commands/pages.ts`

**Tasks**:
1. Extend BaseResourceCommand
2. Implement abstract methods
3. Run tests

**Test Command**:
```bash
. ./.env/dev.sh && npx ts-node ./tests/pages.test.ts
```

---

#### Step 3.2: Migrate Menus Command
**File**: `src/commands/menus.ts`

**Tasks**:
1. Extend BaseResourceCommand
2. Implement abstract methods (GraphQL-specific)
3. Run tests

**Test Command**:
```bash
. ./.env/dev.sh && npx ts-node ./tests/menus.test.ts
```

---

#### Step 3.3: Migrate Metaobjects Command
**File**: `src/commands/metaobjects.ts`

**Tasks**:
1. Extend BaseResourceCommand
2. Handle nested type directories
3. Run tests

**Test Command**:
```bash
. ./.env/dev.sh && npx ts-node ./tests/metaobjects.test.ts
```

---

#### Step 3.4: Migrate Files Command
**File**: `src/commands/files.ts`

**Tasks**:
1. Extend BaseResourceCommand
2. Handle binary files and staging
3. Run tests

**Test Command**:
```bash
. ./.env/dev.sh && npx ts-node ./tests/files.test.ts
```

---

### Phase 4: Final Verification (Day 3)

#### Step 4.1: Run All Tests
**Test Command**:
```bash
. ./.env/dev.sh && npx ts-node ./tests/run-all.ts
```

**Acceptance Criteria**:
- All tests pass for all resources
- No regressions introduced

---

#### Step 4.2: Integration Testing
**Test Commands**:
```bash
# Test pull for all components
npx shopify-admin pull --output=./tests/test-run/integration --components=pages,files,menus,metaobjects,products

# Test push for all components
npx shopify-admin push --input=./tests/test-run/integration --components=pages,files,menus,metaobjects,products --dry-run

# Test mirror mode
npx shopify-admin pull --output=./tests/test-run/mirror --components=products --mirror --dry-run
```

**Acceptance Criteria**:
- All components work correctly
- Mirror mode functions properly
- Dry run mode works
- Error handling consistent

---
## Metadata File Pattern

### Current Implementation
All resource commands follow this pattern:
- **Main File**: Contains the resource data (e.g., `product.json`, `page.html`, `menu.json`)
- **Metadata File**: Contains tracking information (e.g., `product.json.meta`, `page.html.meta`)

### Metadata File Contents
The `.meta` file stores information needed for:
1. **Update vs Create**: Resource IDs determine whether to use PUT (update) or POST (create)
2. **Tracking**: Timestamps, handles, and other immutable properties
3. **Configuration**: Template suffixes, publication status, etc.

**How it works:**
- During **pull**: All products are fetched and downloaded with their IDs stored in `.meta` files
- During **push**: If `.meta` file exists with an ID, use PUT to update; otherwise use POST to create
- This allows the same local file to update an existing remote resource instead of creating duplicates

### Example Metadata Files

**Products** (`test.json.meta`):
```yaml
id: 8675309
title: Test Product
handle: test
vendor: Test Vendor
product_type: Test Type
created_at: '2024-01-01T00:00:00Z'
updated_at: '2024-01-02T00:00:00Z'
published_at: '2024-01-01T12:00:00Z'
template_suffix: custom
status: active
published_scope: web
tags: test,sample
```

**Pages** (`contact.html.meta`):
```yaml
id: 12345
title: Contact Us
handle: contact
author: Admin
created_at: '2024-01-01T00:00:00Z'
updated_at: '2024-01-02T00:00:00Z'
published_at: '2024-01-01T12:00:00Z'
template_suffix: contact
```

**Menus** (`main-menu.json.meta`):
```yaml
id: gid://shopify/Menu/67890
title: Main Menu
handle: main-menu
```

### Base Class Metadata Handling

The base class provides three key methods:

1. **`extractMetadata(resource: TResource): TMetadata`** (abstract)
   - Implemented by each subclass
   - Extracts metadata from the full resource object
   - Returns only the fields that should be persisted in `.meta` file

2. **`writeMetadata(filePath: string, metadata: TMetadata): void`** (concrete)
   - Automatically called after downloading each resource
   - Writes metadata to `.meta` file in YAML format
   - Handles file creation and error logging

3. **`readMetadata(filePath: string): TMetadata | undefined`** (concrete)
   - Called when collecting local files for upload
   - Reads and parses `.meta` file
   - Returns undefined if file doesn't exist or can't be parsed
   - Logs warnings for corrupt files

### Metadata Lifecycle

**During Pull:**
```
1. Fetch resource from Shopify API
2. Download main resource file (subclass)
3. Extract metadata (subclass via extractMetadata)
4. Write .meta file (base class via writeMetadata)
```

**During Push:**
```
1. Collect local files (base class)
2. Read .meta file for each (base class via readMetadata)
3. Use metadata.id to determine create vs update
4. Upload resource with metadata fields (subclass)
```

**During Delete (Mirror Mode):**
```
1. Identify files to delete
2. Delete main file
3. Delete corresponding .meta file (base class)
```

---


## Expected Benefits

### Code Quality
- **Lines Reduced**: ~1,200 lines of duplicated code eliminated
- **Maintainability**: Single source of truth for common patterns
- **Consistency**: Uniform behavior across all resources
- **Type Safety**: Generic types ensure compile-time safety

### Developer Experience
- **Easier to Add New Resources**: Implement 5-7 methods vs 500+ lines
- **Easier to Fix Bugs**: Fix once in base class, applies to all resources
- **Easier to Add Features**: Add to base class, all resources benefit
- **Better Testing**: Test base class once, reduces test duplication

### Performance
- **No Performance Impact**: Same runtime behavior
- **Smaller Bundle**: Less code to bundle and load

---

## Risk Assessment

### Low Risk
- ✅ Existing tests provide safety net
- ✅ Can migrate one resource at a time
- ✅ Can rollback individual migrations
- ✅ TypeScript ensures type safety

### Mitigation Strategies
1. **Incremental Migration**: Migrate one resource at a time
2. **Test After Each Step**: Run tests after each migration
3. **Keep Old Code**: Don't delete until all tests pass
4. **Feature Flags**: Can add flags to switch between old/new implementations

---

## Success Criteria

### Must Have
- [ ] All existing tests pass (40+ tests)
- [ ] No functionality changes
- [ ] Code reduced by at least 1,000 lines
- [ ] All CLI commands work correctly

### Should Have
- [ ] Documentation updated
- [ ] Code review completed
- [ ] Performance benchmarks show no regression

### Nice to Have
- [ ] Additional unit tests for base class
- [ ] Migration guide for future resources
- [ ] Performance improvements identified

---

## Notes

- This is a **refactoring task** - no new features
- Focus on **maintaining existing behavior**
- **Test coverage is critical** - run tests after every change
- **Document any deviations** from this plan
- **Update this document** as implementation progresses