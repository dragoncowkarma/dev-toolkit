# Coding Standards

> Part of the [AGENTS.md](../../AGENTS.md) rule system.

## General
- Use **English** for all code, comments, and variable names.
- Issue titles and descriptions may use **Korean or English**.
- Use 2-space indentation for JS/JSX/CSS, 4-space for Python.
- Maximum line length: 100 characters.

## JavaScript / React
- Use **functional components** with hooks.
- Use **ES modules** (`import/export`).
- Prefer `const` over `let`; never use `var`.
- Use **descriptive** variable and function names.
- Add JSDoc comments for exported functions.
- Each utility tool should be a self-contained module in `src/tools/<tool_name>/`.

## CSS
- Use **CSS custom properties** (design tokens in `:root`).
- Follow BEM-like naming when class names grow complex.
- Mobile-first responsive design.

## File Organization
```
src/
├── main.jsx           # Entry point
├── App.jsx            # Root component with routing
├── index.css          # Global styles & design tokens
├── components/        # Shared UI components
│   ├── Sidebar.jsx
│   ├── ToolCard.jsx
│   └── Layout.jsx
└── tools/             # Each tool in its own directory
    ├── base64/
    │   ├── Base64Tool.jsx
    │   ├── base64.utils.js
    │   └── base64.css
    └── json/
        ├── JsonTool.jsx
        ├── json.utils.js
        └── json.css
```

## Testing
- Utility functions should have unit tests.
- Use `vitest` as the test runner.

## Commits
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Always reference the Issue number.
