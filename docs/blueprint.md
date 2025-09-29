# Shopify Admin CLI Architecture Blueprint

## Vision

A comprehensive CLI tool for Shopify store asset management with GitHub integration, enabling GitOps workflows for store configuration and content management while protecting customer PII.

## Technology Stack

- Runtime: Node.js with TypeScript
- CLI Framework: Commander.js for command parsing
- API Client: Shopify Admin API (REST/GraphQL)
- Storage: Local file system
- Source Control to keep history of changes

## Code Structure

```
shopify-admin-cli/
├── package.json               # Project dependencies and scripts
├── package-lock.json          # Dependency lock file
├── tsconfig.json              # TypeScript configuration
├── README.md                  # Project overview and quick start
├── .gitignore                 # Git ignore patterns
├── docs/
│   ├── blueprint.md           # Architecture and design documentation
│   ├── user-guide.md          # Comprehensive user documentation
│   └── README.md              # Documentation index
├── src/
│   ├── index.ts               # Main CLI entry point and command routing
│   ├── settings.ts            # Configuration management
│   ├── commands/
│   │   ├── auth.ts            # Authentication commands (validate, status)
│   │   └── themes.ts          # Theme management commands (pull, push)
│   └── utils/
│       ├── retry.ts           # Retry logic for API calls
│       └── dry-run.ts         # Dry-run mode utilities
├── tests/
│   ├── auth.test.ts           # Authentication functionality tests
│   ├── retry.test.ts          # Retry utility tests
│   ├── themes.test.ts         # Theme command tests
│   ├── README.md              # Testing documentation
│   └── test-run/              # Test execution artifacts
└── dist/                      # Compiled JavaScript output
```

### Key Components

#### Entry Point (src/index.ts)

- Command-line argument parsing with Commander.js
- Command routing and global error handling
- Environment variable configuration

#### Commands (src/commands/)

- **auth.ts**: Authentication validation and store information
- **themes.ts**: Theme pull and push operations with mirror mode support
- Modular command implementations with consistent parameter handling
- Dry-run support for safe preview of operations
- Standardized output formatting

#### Configuration (src/settings.ts)

- Environment variable management
- Default values and validation
- Configuration precedence handling

## High-Level Architecture

### Core Principles

- GitOps-First: All store assets managed as code in version control
- PII Protection: Exclude customer data, orders, and personal information
- Selective Sync: Granular control over which assets to manage
- Multi-Store: Support for multiple Shopify stores in single workflow

### Authentication Strategy

- Private App Model: Uses Shopify private apps with Admin API access tokens
- Token-Based: Simple bearer token authentication (no OAuth complexity)
- Stateless Design: No credential persistence, uses environment variables and command-line parameters
- Environment Integration: Support for CI/CD and local development workflows

### Asset Management Scope

#### Currently Implemented

- **Theme files and customizations**: Complete theme pull/push with mirror mode
- **Store authentication**: Private app validation and credential management

#### Planned for Future Versions

- Store configuration and settings
- Product catalog structure  
- Content (pages, blogs, navigation)
- Custom scripts and integrations

#### Excluded Assets (PII/Operational)

- Customer data and profiles
- Order history and transactions
- Payment and shipping information
- Analytics and performance data
- Inventory levels and operational metrics

## Command Structure

The CLI follows a hierarchical command structure with grouped functionality for different asset types and operations. For detailed command usage, parameters, and examples, see the [User Guide](user-guide.md).

### Design Principles

- Consistent command patterns across all asset types
- Standardized output format: YAML
- Comprehensive error handling and validation
- Support for both interactive and CI/CD usage

## Integration Points

### Version Control

- Git-native workflow with meaningful commit messages
- Branch-based development for store changes
- Pull request reviews for store modifications

### CI/CD Pipeline

- Automated deployment of approved changes
- Environment promotion (dev → staging → production)
- Rollback capabilities for failed deployments

### Development Workflow

- Local development environment setup
- Preview deployments for testing changes
- Collaborative store management across teams
