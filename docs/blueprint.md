# Shopify Admin CLI Architecture Blueprint

## Vision

A CLI tool for Shopify store asset management enabling GitOps workflows for store configuration and content management while protecting customer PII.

## Core Principles

### GitOps-First Design

All store assets are managed as code in version control:
- Store configuration as declarative code
- Version control for audit trail and rollback
- Pull request workflows for change review
- Environment promotion patterns

### PII Protection

The tool excludes all personally identifiable information:
- No customer data or profiles
- No order history or transactions
- No payment or shipping information
- Focus on store structure, not customer data

### Stateless Authentication

Designed for CI/CD and multi-environment workflows:
- Token-based authentication (no OAuth complexity)
- Environment variable configuration
- No credential persistence
- Works in both interactive and automated contexts

### Selective Sync Philosophy

Users control what assets to manage:
- Explicit paths and targets
- Mirror mode for exact synchronization
- Dry-run preview before changes
- No implicit operations

## Technology Stack

- Node.js with TypeScript for type safety
- Commander.js for CLI structure
- Shopify Admin API (REST) for simplicity
- Local file system for GitOps integration

## Key Design Decisions

### Private App Model

Using Shopify private apps instead of OAuth:
- Simpler authentication flow
- Better suited for automation
- Direct token management
- No callback URL complexity

Rationale: GitOps workflows need deterministic authentication without browser interaction.

### File-Based Operations

All operations work with local file system:
- Pull: remote → local files
- Push: local files → remote
- Mirror: exact synchronization

Rationale: Enables version control integration and diff-based workflows.

### Published Theme Shortcut

The `--published` flag simplifies working with the main/published theme:
- Automatically discovers the published theme by role
- Creates organized folder structure: `output/theme-name/`
- Eliminates need to know exact theme names
- Streamlines maintenance workflows

Rationale: Published theme is the most commonly modified theme. This reduces friction for common operations while maintaining explicit control.

### Mirror Mode

Explicit opt-in for destructive operations:
- Default: additive only (safe)
- Mirror: delete remote items not present locally
- Always requires dry-run first

Rationale: Prevents accidental data loss while enabling exact state management.

### Page Format Simplification

Minimal metadata in page files:
- Single comment line with title and template
- No auto-generated IDs or timestamps
- Filename determines handle

Rationale: Reduces merge conflicts and focuses on content, not metadata.

## Integration Patterns

### Version Control Integration

The tool produces Git-friendly output:
- One file per asset for granular diffs
- Deterministic file naming
- Minimal metadata to reduce conflicts
- Clean directory structure

### CI/CD Integration

Designed for pipeline execution:
- Environment variable authentication
- Exit codes for success/failure
- Structured output for parsing
- Idempotent operations

### Multi-Store Management

Same tool across environments:
- Environment variables determine target store
- Separate directories per environment
- Consistent command interface
- Branch-based environment promotion

## Architecture Boundaries

### In Scope

Store structure and configuration:
- Themes and assets
- Pages and content
- Navigation and menus
- Store settings

### Out of Scope

Operational data:
- Customer information
- Order history
- Inventory levels
- Analytics data

This boundary protects PII while enabling infrastructure-as-code patterns.

## Error Handling Strategy

- Fail fast on authentication errors
- Retry with exponential backoff on rate limits
- Detailed error messages with remediation steps
- Dry-run mode for safe preview

## Future Considerations

As the tool evolves, maintain these principles:
- Keep GitOps workflow central
- Preserve PII protection
- Maintain stateless design
- Avoid implicit behavior

The code is the source of truth for current capabilities. This document focuses on why the tool is designed this way, not what it currently implements.
