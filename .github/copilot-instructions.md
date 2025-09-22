# GitHub Copilot Instructions

## Code Style Guidelines

### Text and Output Formatting

- **No emojis or icons** in code, comments, log messages, or user-facing text
- Use plain text for all output messages, error messages, and documentation
- Avoid Unicode symbols, special characters, or decorative elements
- Keep all text professional and minimal

### Examples

**Avoid:**

```typescript
console.log('✅ Authentication successful!');
console.error('❌ Failed to validate credentials');
// 🚀 TODO: Implement feature
throw new Error('⚠️ Invalid token format');
```

**Prefer:**

```typescript
console.log('Authentication successful');
console.error('Failed to validate credentials');
// TODO: Implement feature
throw new Error('Invalid token format');
```

### Comments and Documentation

- Use clear, concise language without decorative elements
- Focus on explaining the "why" rather than the "what"
- Keep comments professional and technical

### Error Messages and Logging

- Use descriptive but plain error messages
- Include relevant context and actionable information
- Maintain consistent formatting across all messages

### User Interface Text

- Keep CLI output clean and readable
- Use standard text formatting (spaces, dashes, colons)
- Avoid visual noise that doesn't add functional value

## Markdown Style Guidelines

- Use proper headers instead of inline bold text for sections
- Ensure empty line between headers and subsequent texts
- Do not use number 1. 2. 3. use 1. 1. 1. notation, markdown will auto-number

## Rationale

This project prioritizes:
- Professional appearance in enterprise environments
- Consistent text rendering across different terminals and systems
- Accessibility for users with screen readers or text-only environments
- Clean, maintainable code that focuses on functionality over aesthetics